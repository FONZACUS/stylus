'use strict';

const LINTER_DEFAULTS = (() => {
  const SEVERITY = {severity: 'warning'};
  const STYLELINT = {
    rules: {
      'at-rule-no-unknown': [true, {
        'ignoreAtRules': ['extend', 'extends', 'css', 'block'],
        'severity': 'warning'
      }],
      'block-no-empty': [true, SEVERITY],
      'color-no-invalid-hex': [true, SEVERITY],
      'declaration-block-no-duplicate-properties': [true, {
        'ignore': ['consecutive-duplicates-with-different-values'],
        'severity': 'warning'
      }],
      'declaration-block-no-shorthand-property-overrides': [true, SEVERITY],
      'font-family-no-duplicate-names': [true, SEVERITY],
      'function-calc-no-unspaced-operator': [true, SEVERITY],
      'function-linear-gradient-no-nonstandard-direction': [true, SEVERITY],
      'keyframe-declaration-no-important': [true, SEVERITY],
      'media-feature-name-no-unknown': [true, SEVERITY],
      'no-empty-source': false,
      'no-extra-semicolons': [true, SEVERITY],
      'no-invalid-double-slash-comments': [true, SEVERITY],
      'property-no-unknown': [true, SEVERITY],
      'selector-pseudo-class-no-unknown': [true, SEVERITY],
      'selector-pseudo-element-no-unknown': [true, SEVERITY],
      'selector-type-no-unknown': false,
      'string-no-newline': [true, SEVERITY],
      'unit-no-unknown': [true, SEVERITY],

      'comment-no-empty': false,
      'declaration-block-no-redundant-longhand-properties': false,
      'shorthand-property-no-redundant-values': false,
    }
  };
  const CSSLINT = {
    'display-property-grouping': 1,
    'duplicate-properties': 1,
    'empty-rules': 1,
    'errors': 1,
    'warnings': 1,
    'known-properties': 1,

    'adjoining-classes': 0,
    'box-model': 0,
    'box-sizing': 0,
    'bulletproof-font-face': 0,
    'compatible-vendor-prefixes': 0,
    'duplicate-background-images': 0,
    'fallback-colors': 0,
    'floats': 0,
    'font-faces': 0,
    'font-sizes': 0,
    'gradients': 0,
    'ids': 0,
    'import': 0,
    'import-ie-limit': 0,
    'important': 0,
    'order-alphabetical': 0,
    'outline-none': 0,
    'overqualified-elements': 0,
    'qualified-headings': 0,
    'regex-selectors': 0,
    'rules-count': 0,
    'selector-max': 0,
    'selector-max-approaching': 0,
    'selector-newline': 0,
    'shorthand': 0,
    'star-property-hack': 0,
    'text-indent': 0,
    'underscore-property-hack': 0,
    'unique-headings': 0,
    'universal-selector': 0,
    'unqualified-attributes': 0,
    'vendor-prefix': 0,
    'zero-units': 0
  };
  return {STYLELINT, CSSLINT, SEVERITY};
})();
