// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  bulletToTaskInputRule,
  composerCodeFenceInputRule,
  exitComposerQuote,
  listMarkerInputRule,
} from "./composer-block-input";
import {
  buildDocJson,
  ComposerBlockExtensions,
  ComposerCodeBlockExtension,
  ComposerListExtensions,
  ComposerTaskItemExtension,
  ComposerTaskListExtension,
  serializeEditorDoc,
} from "./composer-rich-text-doc";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function createEditor(source = "") {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
        trailingNode: false,
      }),
      ComposerCodeBlockExtension.extend({
        addInputRules: () => [composerCodeFenceInputRule],
      }),
      ...ComposerBlockExtensions,
      ...ComposerListExtensions.map((extension) =>
        extension.name === "bulletList"
          ? extension.extend({
              addInputRules: () => [
                listMarkerInputRule(/^(?<marker>[-*+])(?<space>\s)$/, "bulletList"),
              ],
            })
          : extension,
      ),
      ComposerTaskListExtension,
      ComposerTaskItemExtension.extend({ addInputRules: () => [bulletToTaskInputRule] }),
    ],
    content: buildDocJson(source, (name) => ({ label: name, description: null })),
  });
  editors.push(editor);
  return editor;
}

function typeText(editor: Editor, text: string) {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, character, () =>
        editor.state.tr.insertText(character, from, to),
      ),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(character, from, to));
  }
}

it("creates a code block on the third backtick and keeps code literal", () => {
  const editor = createEditor();
  typeText(editor, "``");
  expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
  typeText(editor, "`");
  expect(editor.state.doc.firstChild?.type.name).toBe("codeBlock");
  typeText(editor, "**literal** @file");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("```\n**literal** @file\n```");
});

it.each(["plain ``", "> ``", "- ``"])(
  "does not create a nested or mid-line fence in %s",
  (source) => {
    const editor = createEditor(source);
    editor.commands.setTextSelection(
      editor.state.doc.content.size - (source.startsWith("plain") ? 1 : 2),
    );
    typeText(editor, "`");
    expect(JSON.stringify(editor.state.doc.toJSON())).not.toContain('"type":"codeBlock"');
  },
);

it("creates an empty bullet on dash and space, then preserves its text", () => {
  const editor = createEditor();
  typeText(editor, "-");
  expect(editor.state.doc.firstChild?.type.name).toBe("paragraph");
  typeText(editor, " ");
  expect(editor.state.doc.firstChild?.type.name).toBe("bulletList");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("- ");
  typeText(editor, "item");
  expect(serializeEditorDoc(editor.state.doc).value).toBe("- item");
});

it.each([" ", "x", "X"])(
  "still converts an immediate bullet into a checkbox with %s",
  (checked) => {
    const editor = createEditor();
    typeText(editor, `- [${checked}] `);
    expect(editor.state.doc.firstChild?.type.name).toBe("taskList");
    expect(editor.state.doc.firstChild?.firstChild?.attrs.checked).toBe(checked !== " ");
    typeText(editor, "task");
    expect(serializeEditorDoc(editor.state.doc).value).toBe(
      `- [${checked === " " ? " " : "x"}] task`,
    );
  },
);

describe("leaving a quote on the first Shift+Enter", () => {
  it.each(["> quote", "> "])("leaves %s with a plain paragraph after it", (source) => {
    const editor = createEditor(source);
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    expect(exitComposerQuote(editor)).toBe(true);
    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    expect(editor.isActive("blockquote")).toBe(false);
    typeText(editor, "outside");
    expect(serializeEditorDoc(editor.state.doc).value).toBe(
      source === "> " ? "outside" : "> quote\noutside",
    );
  });

  it("keeps text after the caret outside the quote", () => {
    const editor = createEditor("> beforeafter");
    editor.commands.setTextSelection(2 + "before".length);
    expect(exitComposerQuote(editor)).toBe(true);
    expect(serializeEditorDoc(editor.state.doc).value).toBe("> before\nafter");
  });
});
