const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([expo, { ignores: ['dist/**', '.expo/**', 'ios/**', 'android/**'] }, { files: ['src/vendor/**'], rules: { '@typescript-eslint/array-type': 'off' } }]);
