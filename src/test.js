requestIdleCallback(myWork);

// 一个任务队列
const tasks = [
  function t1() {
    console.log('执行任务1');
  },
  function t2() {
    console.log('执行任务2');
  },
  function t3() {
    console.log('执行任务3');
  },
];

// deadline是requestIdleCallback返回的一个对象
function myWork(deadline) {
  console.log(`当前帧剩余时间: ${deadline.timeRemaining()}`);
  // 查看当前帧的剩余时间是否大于0 && 是否还有剩余任务
  if (deadline.timeRemaining() > 0 && tasks.length) {
    // 在这里做一些事情
    const task = tasks.shift();
    task();
  }
  // 如果还有任务没有被执行，那就放到下一帧调度中去继续执行，类似递归
  if (tasks.length) {
    requestIdleCallback(myWork);
  }
}

requestAnimationFrame((frameTime) => {
  console.log('frameTime::', frameTime);
})(
  // const channel = new MessageChannel();
  // channel.port1.postMessage('abc');
  // channel.port2.onmessage = (param) => console.log('param:', param);

  () => {
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
  },
)(window);
