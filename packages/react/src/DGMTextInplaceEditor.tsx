import {
  ActionKind,
  Box,
  DblClickEvent,
  Editor,
  macro,
  Shape,
  Text,
  textUtils,
  Transaction,
} from "@dgmjs/core";
import { Editor as TiptapEditor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import {
  extensions,
  TiptapEditorComponent,
  useEditor,
} from "./tiptap/tiptap-editor";
import { moveToAboveOrBelow, textVertAlignToAlignItems } from "./utils";

interface DGMTextInplaceEditorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  editor: Editor;
  toolbar?: React.ReactNode;
  onMount?: (tiptapEditor: TiptapEditor) => void;
  onOpen?: (shape: Box) => void;
}

interface InternalState {
  textShape: Text | null;
  padding: number[];
  alignItems: string;
  textAlign: string;
  lineHeight: number;
  paragraphSpacing: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
  textWidth: number;
  textHeight: number;
}

export const DGMTextInplaceEditor: React.FC<DGMTextInplaceEditorProps> = ({
  editor,
  toolbar,
  onMount,
  onOpen,
  ...others
}) => {
  const toolbarHolderRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<InternalState>({
    textShape: null,
    padding: [0, 0, 0, 0],
    alignItems: "start",
    textAlign: "left",
    lineHeight: 1.2,
    paragraphSpacing: 1,
    fontFamily: "",
    fontSize: 16,
    fontWeight: 400,
    color: "",
    scale: 1,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    textWidth: 0,
    textHeight: 0,
  });

  const tiptapEditor = useEditor({
    extensions,
    content: /* textString.length > 0 ? editingText?.text : */ "",
    onUpdate: (editor) => {
      if (editor && tiptapEditor && state.textShape) {
        const textValue = tiptapEditor.getJSON();
        update(state.textShape, textValue);
      }
    },
  });

  useEffect(() => {
    if (editor) {
      editor.onDblClick.addListener(handleEditorDblClick);
      editor.onKeyDown.addListener(handleEditorKeyDown);
      editor.factory.onCreate.addListener(handleEditorFactoryCreate);
    }
    return function cleanup() {
      if (editor) {
        editor.onDblClick.removeListener(handleEditorDblClick);
        editor.onKeyDown.removeListener(handleEditorKeyDown);
        editor.factory.onCreate.removeListener(handleEditorFactoryCreate);
      }
    };
  }, [editor]);

  useEffect(() => {
    if (tiptapEditor && onMount) {
      onMount(tiptapEditor);
    }
  }, [tiptapEditor]);

  useEffect(() => {
    if (state.textShape) {
      setToolbarPosition({
        left: state.left,
        top: state.top,
        width: state.textShape.width,
        height: state.textShape.height,
      });
    }
  }, [state.left, state.top, state.textShape]);

  const getTextRect = (textShape: Text, doc: any) => {
    const rect = textShape.getRectInDCS(editor.canvas);
    const textMetric = textUtils.measureText(editor.canvas, textShape, doc);
    const shapeWidth =
      textMetric.minWidth + state.padding[1] + state.padding[3];
    const shapeHeight = textMetric.height + state.padding[0] + state.padding[2];
    const MIN_WIDTH = 1;
    return {
      left: rect[0][0],
      top: rect[0][1],
      width: Math.max(shapeWidth, MIN_WIDTH),
      height: shapeHeight,
      textWidth: textMetric.width,
      textHeight: textMetric.height,
    };
  };

  const setToolbarPosition = (rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => {
    if (toolbarHolderRef.current) {
      moveToAboveOrBelow(
        editor,
        toolbarHolderRef.current,
        [
          [rect.left, rect.top],
          [rect.left + rect.width, rect.top + rect.height],
        ],
        32
      );
    }
  };

  const open = (textShape: Box) => {
    if (editor.getCurrentPage() && textShape) {
      // Store original dimensions to restore later
      const originalWidth = textShape.width;
      const originalHeight = textShape.height;

      // Save original dimensions as properties to restore during updates and when closing
      (textShape as any)._originalWidth = originalWidth;
      (textShape as any)._originalHeight = originalHeight;

      // disable shape's text rendering
      textShape.allowRenderText = false;
      textShape.update(editor.canvas);
      editor.repaint();

      // start transaction
      editor.transform.startAction(ActionKind.EDIT_TEXT);

      // set initial content and ensure focus
      tiptapEditor?.commands.setContent(textShape.text);

      // Force focus with a tiny delay to ensure DOM is ready
      setTimeout(() => {
        tiptapEditor?.commands.focus("end");

        // Select all if there is text or just place cursor at end
        if (
          textShape.text &&
          typeof textShape.text === "object" &&
          textShape.text.content &&
          textShape.text.content.length > 0
        ) {
          tiptapEditor?.commands.selectAll();
        }
      }, 10);

      // update states
      update(textShape, textShape.text);

      // Additional callback for external handling
      setTimeout(() => {
        if (onOpen) onOpen(textShape as Box);
      }, 0);
    }
  };

  const update = (textShape: Box, textValue: any) => {
    if (editor.getCurrentPage()) {
      // mutate text shape
      editor.transform.transact((tx: Transaction) => {
        tx.assign(textShape, "text", textValue);

        // Restore original dimensions during update to prevent expansion
        if ((textShape as any)._originalWidth !== undefined) {
          tx.assign(textShape, "width", (textShape as any)._originalWidth);
          tx.assign(textShape, "height", (textShape as any)._originalHeight);
        }

        macro.resolveAllConstraints(
          tx,
          editor.getCurrentPage()!,
          editor.canvas
        );
      });

      // Get text rect but respect original dimensions
      const rect = getTextRect(textShape as Text, textValue);

      setState({
        textShape: textShape as Text,
        padding: textShape.padding,
        alignItems: textVertAlignToAlignItems(textShape.vertAlign),
        textAlign: textShape.horzAlign,
        lineHeight: textShape.lineHeight,
        paragraphSpacing: textShape.paragraphSpacing,
        fontFamily: textShape.fontFamily,
        fontSize: textShape.fontSize,
        fontWeight: textShape.fontWeight,
        color: editor.canvas.resolveColor(textShape.fontColor),
        scale: editor.getScale(),
        left: rect.left,
        top: rect.top,
        width: (textShape as any)._originalWidth || rect.width,
        height: (textShape as any)._originalHeight || rect.height,
        textWidth: rect.textWidth,
        textHeight: rect.textHeight,
      });
    }
  };

  const close = () => {
    if (tiptapEditor && state.textShape) {
      const textShape = state.textShape;

      // Clean up the temporary properties
      if ((textShape as any)._originalWidth !== undefined) {
        delete (textShape as any)._originalWidth;
        delete (textShape as any)._originalHeight;
      }

      editor.transform.endAction();
      const textValue = tiptapEditor.getJSON();
      const textString = textUtils.convertTextNodeToString(textValue);

      if (state.textShape instanceof Text && textString.trim().length === 0) {
        editor.actions.remove([state.textShape]);
      } else if (state.textShape) {
        // Ensure the text is properly saved to the shape
        editor.transform.transact((tx: Transaction) => {
          if (state.textShape) {
            tx.assign(state.textShape, "text", textValue);
          }
        });
      }

      if (state.textShape) {
        state.textShape.allowRenderText = true;
        state.textShape.update(editor.canvas);
      }

      editor.repaint();
      setState((state) => ({ ...state, textShape: null }));
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") close();
  };

  const handleEditorKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      if (editor.selection.size() === 1) {
        const shape = editor.selection.shapes[0];
        if (shape instanceof Box && shape.textEditable) {
          open(shape);
        }
      }
    }
  };

  const handleEditorDblClick = ({ shape, point }: DblClickEvent) => {
    if (shape instanceof Box && shape.textEditable) {
      open(shape);
    }
  };

  const handleEditorFactoryCreate = (shape: Shape) => {
    if (shape instanceof Text && shape.textEditable) {
      // Ensure the shape is selected
      editor.selection.deselectAll();
      editor.selection.select([shape]);

      // Use setTimeout to ensure the shape is fully initialized before opening the editor
      setTimeout(() => {
        // Verify the shape still exists and has proper dimensions
        if (shape && editor.getCurrentPage()?.children.includes(shape)) {
          // Ensure minimum dimensions
          if (shape.width < 100) shape.width = 350;
          if (shape.height < 50) shape.height = 150;

          // Force a repaint
          editor.repaint();

          // Open the editor
          open(shape);

          // Add an additional focus call with a delay to ensure focus happens after rendering
          setTimeout(() => {
            if (tiptapEditor) {
              tiptapEditor.commands.focus("end");
            }
          }, 50);
        }
      }, 10);
    }
  };

  return (
    <>
      {state.textShape && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
            }}
            onPointerDown={close}
          />
          <div
            style={{
              position: "absolute",
              display: "flex",
              zIndex: 10000,
              outline: "none",
              overflow: "hidden",
              paddingTop: state.padding[0],
              paddingRight: state.padding[1],
              paddingBottom: state.padding[2],
              paddingLeft: state.padding[3],
              alignItems: state.alignItems,
              left: state.left,
              top: state.top,
              width: state.width,
              height: state.height,
              transform: `scale(${state.scale})`,
            }}
            {...others}
          >
            <TiptapEditorComponent
              editor={tiptapEditor}
              fontFamily={state.fontFamily}
              fontSize={state.fontSize}
              fontWeight={state.fontWeight}
              fontColor={state.color}
              lineHeight={state.lineHeight}
              textHeight={state.textHeight}
              paragraphSpacing={state.paragraphSpacing}
              alignItems={state.alignItems}
              onBlur={() => {}}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div
            ref={toolbarHolderRef}
            style={{
              position: "absolute",
              background: "transparent",
              zIndex: 10000,
              outline: "none",
            }}
          >
            {toolbar}
          </div>
        </>
      )}
    </>
  );
};
