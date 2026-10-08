import { InputRule, type Editor } from "@tiptap/core";

import { convertBulletItemToTask } from "./composer-rich-text-doc";

/** Three backticks on an empty top-level line open a code block immediately. */
export const composerCodeFenceInputRule = new InputRule({
  find: /^```$/,
  handler: ({ state, range, chain }) => {
    const $from = state.doc.resolve(range.from);
    if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null;
    chain().deleteRange(range).setCodeBlock().run();
    return undefined;
  },
});

/** Leave a quote while keeping any text after the caret outside it. */
export function exitComposerQuote(editor: Editor): boolean {
  if (!editor.isActive("blockquote")) return false;
  return editor.state.selection.$from.parent.content.size === 0
    ? editor.commands.lift("blockquote")
    : editor.chain().splitBlock().lift("blockquote").run();
}

/**
 * A typed marker becomes a list item that remembers the marker it was typed
 * with, so the stored Markdown keeps `*` or `3)` rather than a canonical `-`.
 */
export function listMarkerInputRule(
  find: RegExp,
  listType: "bulletList" | "orderedList",
): InputRule {
  return new InputRule({
    find,
    handler: ({ state, range, match, chain }) => {
      const marker = match.groups?.marker ?? "-";
      const space = match.groups?.space ?? " ";
      // Top-level paragraphs only: inside an item or a quote the new list
      // would nest under a line the stored draft writes flat.
      const $from = state.doc.resolve(range.from);
      if ($from.parent.type.name !== "paragraph" || $from.depth !== 1) return null;
      chain()
        .deleteRange(range)
        .wrapInList(
          listType,
          listType === "orderedList" ? { start: Number.parseInt(marker, 10) || 1 } : {},
        )
        .updateAttributes("listItem", { marker, space })
        .run();
      return undefined;
    },
  });
}

/**
 * `[ ] ` at the start of an existing bullet item turns it into a task, for
 * items that were already a list when the checkbox was wanted. This also keeps
 * `- [ ] ` working after the dash and space create a bullet immediately.
 */
export const bulletToTaskInputRule = new InputRule({
  find: /^\[([ xX])\] $/,
  handler: ({ state, range, match, chain }) => {
    const $from = state.doc.resolve(range.from);
    const item = $from.node(-1);
    if ($from.parent.type.name !== "paragraph" || item?.type.name !== "listItem") return null;
    // Any bullet converts; the task grammar only knows `-`, so a `*` or `+`
    // item comes back out as `- [ ]`.
    if (!["-", "*", "+"].includes((item.attrs as { marker?: string }).marker ?? "")) return null;
    const checked = (match[1] ?? " ").toLowerCase() === "x";
    chain()
      .command(({ tr }) => {
        convertBulletItemToTask(tr, range.from, range.to, checked);
        return true;
      })
      .run();
    return undefined;
  },
});
