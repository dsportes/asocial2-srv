import path from 'path'

export default {
  entry: './src-fw/index.ts',
  target: "node",
  mode: "production",
  output: {
    filename: 'bundle.js',
    path: path.resolve('../tmp/srv'),
  },

  // externals: {'better-sqlite3': 'commonjs better-sqlite3'},

  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  }

}
