const path = require('path');
const fs = require('fs');
const remark = require('remark');
const slug = require('remark-slug');
const hljs = require('remark-highlight.js');
const emojiToGemoji = require('remark-emoji-to-gemoji');
const html = require('remark-html');
const visit = require('unist-util-visit');
const toString = require('mdast-util-to-string');
const remarkFrontmatter = require('remark-frontmatter');

const emojiPath = path.resolve(path.dirname(require.resolve('emojify.js')), '..', 'images', 'basic');

function gemojiExists(emoji) {
  try {
    const stat = fs.statSync(path.join(emojiPath, `${emoji}.png`));
    return stat.isFile();
  } catch (err) {
    return false;
  }
}

function gemojiToImages() {
  function extractTextNode(string, start, end) {
    const startLine = string.slice(0, start).split('\n');
    const endLine = string.slice(0, end).split('\n');

    const position = {
      start: {
        line: startLine.length,
        column: startLine[startLine.length - 1].length + 1,
      },
      end: {
        line: endLine.length,
        column: endLine[endLine.length - 1].length + 1,
      },
    };

    const textNode = {
      type: 'text',
      value: string.slice(start, end),
      position,
    };

    return textNode;
  }

  return function transformer(tree) {
    const reg = /:([^:]+):/g;

    visit(tree, 'text', (node, nodeIndex, parent) => {
      // Because adding nodes to parent.children changes the indices and the
      // nodeIndex provided by `visit` is therefore wrong we need to find the
      // new index
      const actualIndex = parent.children.reduce((newIndex, child, index) => {
        if (child === node) {
          return index;
        }

        return newIndex;
      }, null);

      const nodes = [];
      let lastIndex = 0;
      let m;

      // eslint-disable-next-line no-cond-assign
      while ((m = reg.exec(node.value)) !== null) {
        const gemojiLength = m[0].length;
        const gemojiName = m[1];

        if (!gemojiExists(gemojiName)) {
          return;
        }

        if (m.index !== lastIndex) {
          const textNode = extractTextNode(node.value, lastIndex, m.index);
          lastIndex += textNode.value.length;
          nodes.push(textNode);
        }

        const imageNode = {
          type: 'image',
          data: {
            hProperties: {
              align: 'absmiddle',
              alt: `:${gemojiName}:`,
              className: 'emoji',
            },
          },
          url: `emoji://${gemojiName}`,
          title: `:${gemojiName}:`,
        };

        nodes.push(imageNode);

        lastIndex += gemojiLength;
      }

      if (lastIndex !== node.value.length) {
        const textNode = extractTextNode(node.value, lastIndex, node.value.length);
        nodes.push(textNode);
      }

      const beforeNodes = parent.children.slice(0, actualIndex);
      const afterNodes = parent.children.slice(actualIndex + 1);

      // eslint-disable-next-line no-param-reassign
      parent.children = [].concat(
        beforeNodes,
        nodes,
        afterNodes,
      );
    });
  };
}

function fixHeadings() {
  const reg = /^([#]+)\s?(.+)$/;

  return function transformer(tree) {
    visit(tree, 'paragraph', (node, nodeIndex, parent) => {
      const nodeText = toString(node);
      if (parent.type === 'root' && reg.test(nodeText)) {
        const nodeTextParts = reg.exec(nodeText);
        /* eslint-disable no-param-reassign */
        node.type = 'heading';
        node.depth = nodeTextParts[1].length;

        node.children = [].concat(node.children)
          .map((child, index) => {
            if (child.type === 'text' && index === 0) {
              return Object.assign({}, child, {
                value: nodeTextParts[2],
              });
            }

            return child;
          });
        /* eslint-enable no-param-reassign */
      }
    });
  };
}

function patchNode(context, key, value) {
  if (!context[key]) {
    // eslint-disable-next-line no-param-reassign
    context[key] = value;
  }

  return context;
}

function fixCheckListStyles() {
  return function transformer(tree) {
    visit(tree, 'listItem', (node) => {
      if (node.checked !== null) {
        const data = patchNode(node, 'data', {});
        patchNode(data, 'hProperties', {
          className: 'task-list-item',
        });
      }
    });
  };
}

function frontmatter(fmts) {
  if (!fmts.length) {
    return [() => {}];
  }

  return [remarkFrontmatter, fmts];
}

module.exports = function renderMarkdown(text, opts, callback) {
  remark()
    .use(emojiToGemoji)
    .use(gemojiToImages)
    .use(fixHeadings)
    .use(fixCheckListStyles)
    .use(slug)
    .use(...frontmatter(opts.ignorefrontmatter))
    .use([hljs, html], {
      sanitize: false,
    })
    .process(text, callback);
};
