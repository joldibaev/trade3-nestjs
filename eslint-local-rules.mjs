// @ts-check

/** @type {import('eslint').Rule.RuleModule} */
const noInlineReturn = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow inline object types in function return values. Use named interfaces/types instead.',
    },
    messages: {
      noInline:
        'Forbidden inline object type in return value. Please define a named interface or type.',
    },
    schema: [],
  },
  create(context) {
    return {
      // Catch: function(): { a: string } {}
      ':function > TSTypeAnnotation > TSTypeLiteral'(node) {
        context.report({
          node,
          messageId: 'noInline',
        });
      },
      // Catch: function(): Promise<{ a: string }> {}
      ':function > TSTypeAnnotation > TSTypeReference[typeName.name="Promise"] > TSTypeParameterInstantiation > TSTypeLiteral'(
        node,
      ) {
        context.report({
          node,
          messageId: 'noInline',
        });
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  rules: {
    'no-inline-return': noInlineReturn,
  },
};

export default plugin;
