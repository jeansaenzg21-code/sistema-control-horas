import nextVitals from 'eslint-config-next/core-web-vitals'

const ignores = [
  '.next/**',
  'node_modules/**',
  'timer/**',
  'next-env.d.ts',
]

const rules = {
  'react-hooks/immutability': 'off',
  'react-hooks/preserve-manual-memoization': 'off',
  'react-hooks/purity': 'off',
  'react-hooks/refs': 'off',
  'react-hooks/set-state-in-effect': 'off',
}

const config = [
  ...nextVitals,
  { ignores },
  { rules },
]

export default config
