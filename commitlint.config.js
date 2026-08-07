export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'platform',
        'recon',
        'threat-intel',
        'reports',
        'api',
        'integrations',
        'ui',
        'db',
        'auth',
        'queue',
        'ci',
        'deps',
        'planning',
      ],
    ],
  },
};
