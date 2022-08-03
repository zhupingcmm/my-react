let wipRoot = null;
let nextUnitOfWork = null;
let currentRoot = null;
let deletions = [];
let wipFiber;
let hookIndex = 0;

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
      dom.addEventListener(addKey.slice(2).toLocaleLowerCase(), addKey);
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

const reconcileChildren = (fiberNode, children = []) => {
  let index = 0;
  let oldFiberNode = void 0;
  let preSibling = void 0;
  const virtualElements = children.flat(Infinity);

  if (fiberNode.alternate && fiberNode.alternate.children) {
    oldFiberNode = fiberNode.alternate.child;
  }

  while (
    index < virtualElements.length ||
    typeof oldFiberNode !== 'undefined'
  ) {
    const virtualElement = virtualElements[index];
    let newFiber = void 0;
    // let prevSibling = void 0;
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
      preSibling.sibling = newFiber;
    }

    preSibling = newFiber;

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

  hookIndex += 1;

  const setState = (val) => {
    hook.queue.push(val);
    if (currentRoot) {
      wipRoot = {
        type: currentRoot.type,
        dom: currentRoot.dom,
        props: currentRoot.preProps,
        alternate: currentRoot,
      };
      nextUnitOfWork = wipRoot;
      deletions = [];
      currentRoot = null;
    }
  };
  return [hook.state, setState];
};
const performUnitOfWork = (fiberNode) => {
  const { type } = fiberNode;
  switch (typeof type) {
    case 'function':
      console.log('function');
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
      reconcileChildren(
        fiberNode,
        isPlainObject(fiberNode.props.children)
          ? [fiberNode.props.children]
          : fiberNode.props.children,
      );
      break;
    default:
      console.log('===');
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

const workLoop = (deadline) => {
  // console.log(deadline.timeRemaining());
  while (nextUnitOfWork && deadline.timeRemaining() > 1) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }
  window.requestIdleCallback(workLoop);
};

const render = (element, container) => {
  console.log('ele', element, container);
  currentRoot = null;
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
