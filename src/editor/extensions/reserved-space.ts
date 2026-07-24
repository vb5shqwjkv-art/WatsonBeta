import { Extension } from "@tiptap/core";

/**
 * ReservedSpace — lets a paragraph reserve a minimum height.
 *
 * When an arrow is anchored under a word, the editor auto-inserts an empty
 * paragraph below it (a real, numbered blank line) whose reserved height clears
 * the arrow, so the arrow never overlaps the following text.
 */
export const ReservedSpace = Extension.create({
  name: "reservedSpace",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          reservedSpace: {
            default: null,
            parseHTML: (element) => {
              const value = element.style.minHeight;
              return value ? parseInt(value, 10) : null;
            },
            renderHTML: (attributes) => {
              const space = attributes.reservedSpace as number | null;
              return space ? { style: `min-height: ${space}px` } : {};
            },
          },
        },
      },
    ];
  },
});
