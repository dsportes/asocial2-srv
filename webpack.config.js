const path = require('path');

module.exports = {
  entry: './src-fw/index.ts',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  target: "node",
  mode: "production",
  output: {
    filename: 'bundle.js',
    path: path.resolve('dist'),
  }
}
