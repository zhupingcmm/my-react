import React from './mini-react.js';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      count: 0,
    };
  }

  render() {
    const { count } = this.state;
    return (
      <div>
        <div>
          <h1>oo</h1>
          <div>
            <button
              onClick={() => {
                this.setState({ count: count + 1 });
              }}
            >
              Add
            </button>
            <span>{count}</span>
          </div>
        </div>
      </div>
    );
  }
}

// eslint-disable-next-line react/no-deprecated
React.render(<App />, document.getElementById('root'));
