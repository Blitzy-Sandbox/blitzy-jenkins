module.exports = {
  plugins: {
    "postcss-preset-env": {
      stage: false,
      features: {
        "media-query-ranges": true,
      },
      preserve: false,
    },
  },
};
