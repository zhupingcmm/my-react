let wipRoot = null;
let nextUnitOfWork = null;
let currentRoot = null;
let deletions = [];
let wipFiber;
let hookIndex = 0;

// Support React.Fragment syntax.
const Fragment = Symbol.for('react.fragment');

// Enhanced requestIdleCallback.
((global) => {
  const id = 1;
  const fps = 1e3 / 60;
  let frameDeadline;
  let pendingCallback;
  const channel = new MessageChannel();
  const timeRemaining = () => frameDeadline - window.performance.now();

  const deadline = {
    didTimeout: false,
    timeRemaining,
  };

  channel.port2.onmessage = () => {
    if (typeof pendingCallback === 'function') {
      pendingCallback(deadline);
    }
  };

  global.requestIdleCallback = (callback) => {
    global.requestAnimationFrame((frameTime) => {
      frameDeadline = frameTime + fps;
      pendingCallback = callback;
      channel.port1.postMessage(null);
    });
    return id;
  };
})(window);

const isPlainObject = (obj) =>
  Object.prototype.toString.call(obj) === '[object Object]' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(obj));

// Simple judgment of virtual elements.
const isVirtualElement = (e) => typeof e === 'object';

const isDef = (param) => param !== void 0 && param !== null;

const createTextElement = (text) => ({
  type: 'TEXT',
  props: {
    nodeValue: text,
  },
});

const updateDom = (dom, preProps, nextProps) => {
  const defaultKeys = 'children';
  for (const [removeKey, removeValue] of Object.entries(preProps)) {
    if (removeKey.startsWith('on')) {
      dom.removeEventListener(
        removeKey.slice(2).toLocaleLowerCase(),
        removeValue,
      );
    } else if (removeKey !== defaultKeys) {
      delete dom[removeKey];
    }
  }

  for (const [addKey, addValue] of Object.entries(nextProps)) {
    if (addKey.startsWith('on')) {
      dom.addEventListener(addKey.slice(2).toLocaleLowerCase(), addValue);
    } else if (addKey !== defaultKeys) {
      dom[addKey] = addValue;
    }
  }
};

const createDom = (fiberNode) => {
  const { type, props } = fiberNode;
  let dom = null;
  if (type === 'TEXT') {
    dom = document.createTextNode('');
  } else if (typeof type === 'string') {
    dom = document.createElement(type);
  }

  if (dom !== null) {
    updateDom(dom, {}, props);
  }
  return dom;
};

// Create custom JavaScript data structures.
const createElement = (type, props = {}, ...child) => {
  const children = child.map((c) =>
    isVirtualElement(c) ? c : createTextElement(String(c)),
  );

  return {
    type,
    props: {
      ...props,
      children,
    },
  };
};

/**
 * 调和子节点，遍历当前fiberNode子节点，标注effectTag
 * 新  旧
 * Y   Y  update
 * Y   N  replacement
 * N   Y  delete
 * N   N  不用考虑
 * @param {*} fiberNode 当前调和的fiber节点
 * @param {*} children 当前fiber节点的子节点
 *
 */
const reconcileChildren = (fiberNode, children = []) => {
  let index = 0;
  let oldFiberNode = void 0;
  let prevSibling = void 0;
  const virtualElements = children.flat(Infinity);

  if (fiberNode.alternate && fiberNode.alternate.child) {
    oldFiberNode = fiberNode.alternate.child;
  }

  while (
    index < virtualElements.length ||
    typeof oldFiberNode !== 'undefined'
  ) {
    const virtualElement = virtualElements[index];
    let newFiber = void 0;
    const isSameType = Boolean(
      oldFiberNode &&
        virtualElement &&
        oldFiberNode.type === virtualElement.type,
    );

    if (isSameType && oldFiberNode) {
      newFiber = {
        type: oldFiberNode.type,
        dom: oldFiberNode.dom,
        alternate: oldFiberNode,
        props: virtualElement.props,
        return: fiberNode,
        effectTag: 'UPDATE',
      };
    }

    if (!isSameType && Boolean(virtualElement)) {
      newFiber = {
        type: virtualElement.type,
        dom: null,
        alternate: null,
        props: virtualElement.props,
        return: fiberNode,
        effectTag: 'REPLACEMENT',
      };
    }

    if (!isSameType && oldFiberNode) {
      deletions.push(oldFiberNode);
    }

    if (oldFiberNode) {
      oldFiberNode = oldFiberNode.sibling;
    }

    if (index === 0) {
      fiberNode.child = newFiber;
    } else if (typeof prevSibling !== 'undefined') {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index += 1;
  }
};

const useState = (initialState) => {
  const hook = wipFiber?.alternate?.hooks
    ? wipFiber.alternate.hooks[hookIndex]
    : { state: initialState, queue: [] };
  while (hook.queue.length) {
    let newState = hook.queue.shift();
    if (isPlainObject(newState) && isPlainObject(hook.state)) {
      newState = { ...hook?.state, ...newState };
    }
    hook.state = newState;
  }

  if (typeof wipFiber.hooks === 'undefined') {
    wipFiber.hooks = [];
  }

  wipFiber.hooks.push(hook);
  hookIndex += 1;

  const setState = (val) => {
    hook.queue.push(val);
    if (currentRoot) {
      wipRoot = {
        type: currentRoot.type,
        dom: currentRoot.dom,
        props: currentRoot.props,
        alternate: currentRoot,
      };
      nextUnitOfWork = wipRoot;
      deletions = [];
      currentRoot = null;
    }
  };
  return [hook.state, setState];
};

/**
 * 儿子节点是第一优先级
 * 兄弟节点是第二优先级
 * 返回父亲节点，
 * @param {*} fiberNode 当前节点
 * @returns 下一个fiberNode
 */
const performUnitOfWork = (fiberNode) => {
  const { type } = fiberNode;
  switch (typeof type) {
    case 'function':
      wipFiber = fiberNode;
      wipFiber.hooks = [];
      hookIndex = 0;
      // eslint-disable-next-line no-case-declarations
      let children;
      if (Object.getPrototypeOf(type).REACT_COMPONENT) {
        const C = type;
        const component = new C(fiberNode.preProps);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const [state, setState] = useState(component.state);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        // useEffect(() => {}, [])

        component.props = fiberNode.props;
        component.state = state;
        component.setState = setState;
        children = component.render?.bind(component)();
      } else {
        children = type(fiberNode.props);
      }
      reconcileChildren(fiberNode, [
        isVirtualElement(children)
          ? children
          : createTextElement(String(children)),
      ]);
      break;
    case 'string':
    case 'number':
      if (!fiberNode.dom) {
        fiberNode.dom = createDom(fiberNode);
      }
      reconcileChildren(fiberNode, fiberNode.props.children);
      break;
    case 'symbol':
      if (type === Fragment) {
        reconcileChildren(fiberNode, fiberNode.props.children);
      }
      break;
    default:
      if (typeof fiberNode.props !== 'undefined') {
        reconcileChildren(fiberNode, fiberNode.preProps.children);
      }
  }

  if (fiberNode.child) {
    return fiberNode.child;
  }

  let nextFiberNode = fiberNode;
  while (typeof nextFiberNode !== 'undefined') {
    if (nextFiberNode.sibling) {
      return nextFiberNode.sibling;
    }
    nextFiberNode = nextFiberNode.return;
  }

  return null;
};

const commitRoot = () => {
  const findParentFiber = (fiberNode) => {
    if (fiberNode) {
      let parentFiber = fiberNode.return;
      while (parentFiber && !parentFiber.dom) {
        parentFiber = parentFiber.return;
      }

      return parentFiber;
    }
    return null;
  };
  const commitReplacement = (parentDom, dom) => {
    if (isDef(parentDom)) {
      parentDom.appendChild(dom);
    }
  };

  const commitDeletion = (parentDom, dom) => {
    if (isDef(parentDom)) {
      parentDom.removeChild(dom);
    }
  };
  const commitWork = (fiberNode) => {
    if (fiberNode) {
      if (fiberNode.dom) {
        const parentFiber = findParentFiber(fiberNode);
        const parentDom = parentFiber?.dom;
        switch (fiberNode.effectTag) {
          case 'REPLACEMENT':
            commitReplacement(parentDom, fiberNode.dom);
            break;
          case 'UPDATE':
            updateDom(
              fiberNode.dom,
              fiberNode.alternate ? fiberNode.alternate.props : {},
              fiberNode.props,
            );
            break;
          default:
            break;
        }
      }
      commitWork(fiberNode.child);
      commitWork(fiberNode.sibling);
    }
  };

  for (const deletion of deletions) {
    if (deletion.dom) {
      const parentFiber = findParentFiber(deletion);
      commitDeletion(parentFiber.dom, deletion.dom);
    }
  }

  if (wipRoot !== null) {
    commitWork(wipRoot.child);
    currentRoot = wipRoot;
  }
  wipRoot = null;
};
/**
 *
 * @param {*} deadline 有2个返回值 1. didTimeout: 表示requestIdleCallback 是否过期 2.timeRemaining 函数 这一针还剩余多长时间
 * 遍历和构件fiber tree
 * 提交改动
 */
const workLoop = (deadline) => {
  while (nextUnitOfWork && deadline.timeRemaining() > 1) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  window.requestIdleCallback(workLoop);
};

/**
 * @param {*} element 第一个节点
 * @param {*} container 挂载的根节点 <div id ='root'/>
 */
const render = (element, container) => {
  // 设置currentRoot 为 null
  currentRoot = null;
  // 初始化 wipRoot
  wipRoot = {
    type: 'div',
    dom: container,
    props: {
      children: [
        {
          ...element,
        },
      ],
    },
    alternate: currentRoot,
  };

  nextUnitOfWork = wipRoot;
  // 初始化 deletions
  deletions = [];
};

class Component {
  props;

  constructor(props) {
    this.props = props;
  }

  // Identify Component.
  static REACT_COMPONENT = true;
}

void (function main() {
  window.requestIdleCallback(workLoop);
})();

export default {
  render,
  Component,
  createElement,
};
