export const REACT_VERSION = '18.3.1';

/**
 * React and ReactDOM must resolve to one shared singleton, including subpath
 * imports such as `react/jsx-runtime` and `react-dom/client`.
 * A trailing slash is a prefix match in Module Federation's shared config.
 */
export function reactShared({ eager }) {
  const sharedModule = {
    singleton: true,
    requiredVersion: REACT_VERSION,
    eager,
  };

  return {
    react: { ...sharedModule },
    'react/': { ...sharedModule },
    'react-dom': { ...sharedModule },
    'react-dom/': { ...sharedModule },
  };
}
