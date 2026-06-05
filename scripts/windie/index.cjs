const { dispatch } = require('./commands.cjs');

async function main(argv) {
  await dispatch(argv);
}

module.exports = {
  main,
};
