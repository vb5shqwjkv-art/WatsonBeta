import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * FontSize — an inline mark that sets the font size of a text span.
 *
 * Kept as its OWN mark (not a TextStyle attribute) so it composes cleanly with
 * color: "scrivilo in rosso e più grande" becomes two independent spans, and
 * setting one never drops the other.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      /** Set an explicit font size, e.g. "14pt". */
      setFontSize: (size: string) => ReturnType;
      /** Remove the font-size mark (back to normal). */
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Mark.create({
  name: "fontSize",

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          const size = attributes.size as string | null;
          return size ? { style: `font-size: ${size}` } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ style: "font-size" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ commands }) =>
          commands.setMark(this.name, { size }),
      unsetFontSize:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
