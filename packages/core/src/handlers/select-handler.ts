import { ActionKind } from "../core";
import { Editor, Handler, manipulatorManager } from "../editor";
import { Color, Cursor, Mouse } from "../graphics/const";
import * as geometry from "../graphics/geometry";
import { CanvasPointerEvent } from "../graphics/graphics";
import { Shape } from "../shapes";
import * as guide from "../utils/guide";

/**
 * Select Handler
 */
export class SelectHandler extends Handler {
  /**
   * A set of shapes that should be deselected when pointer up. This is required
   * to deselect shapes on pointer up, not pointer down. This allows controllers
   * can handle shift key while pointer down.
   */
  private deselectOnPointerUp: Shape[] = [];

  /**
   * Returns a shape (with manipulator area) located at the position e.
   */
  getShapeAt(editor: Editor, e: CanvasPointerEvent): Shape | null {
    const canvas = editor.canvas;
    const page = editor.getCurrentPage();
    if (page) {
      let p = canvas.globalCoordTransformRev([e.x, e.y]);
      // find in selected contoller's handles
      for (let s of editor.selection.getShapes()) {
        const manipulator = manipulatorManager.get(s.type);
        if (manipulator && manipulator.mouseInHandles(editor, s, e)) {
          return s;
        }
      }
      // find in the current page
      return page.getShapeAt(canvas, p);
    }
    return null;
  }

  /**
   * handle pointer down event
   */
  pointerDown(editor: Editor, e: CanvasPointerEvent) {
    const canvas = editor.canvas;
    const page = editor.getCurrentPage();
    if (!page) return;

    editor.duplicatedDragging = false;
    editor.pointerDownUnselectedShape = false;
    const selectionsManipulator = manipulatorManager.get("selections");

    if (e.button === Mouse.BUTTON1) {
      const shape = this.getShapeAt(editor, e);
      if (shape) {
        // single selection
        if (e.shiftDown) {
          if (editor.selection.isSelected(shape)) {
            // editor.selection.deselect([shape]);
            this.deselectOnPointerUp = [shape];
          } else {
            editor.selection.select([shape], false);
          }
        } else {
          if (!editor.selection.isSelected(shape)) {
            editor.pointerDownUnselectedShape = true;
            editor.selection.select([shape]);
          }
        }
      } else if (
        // multiple selection
        editor.selection.size() > 1 &&
        selectionsManipulator &&
        selectionsManipulator.mouseIn(editor, page, e)
      ) {
        // do nothing to delegate to selections manipulator later
      } else {
        // area selection
        if (!e.shiftDown) {
          editor.selection.deselectAll();
        }
        this.dragging = true;
        this.dragStartPoint = canvas.globalCoordTransformRev([e.x, e.y]);
        editor.onDragStart.emit({
          controller: null,
          dragPoint: this.dragStartPoint,
        });
      }

      // duplicated dragging (alt/opt + mouse)
      if (e.altDown && !e.modDown && !e.shiftDown) {
        // deselect the shape if mouse is outside of the shape
        if (shape && editor.selection.isSelected(shape)) {
          const p = canvas.globalCoordTransformRev([e.x, e.y]);
          if (!shape.containsPoint(canvas, p)) {
            editor.selection.deselect([shape]);
          }
        }
        // duplicate selected shapes
        if (editor.selection.size() > 0) {
          const copied = editor.actions.duplicate(
            editor.selection.getShapes(),
            0,
            0
          );
          editor.selection.select(copied);
        }
        editor.duplicatedDragging = true;
      }
    }

    if (e.button === Mouse.BUTTON3) {
      // select a shape (include disabled and invisible) if mouse right click
      const p = canvas.globalCoordTransformRev([e.x, e.y]);
      const shape = page.getShapeAt(canvas, p, [], true);
      if (shape && !editor.selection.isSelected(shape))
        editor.selection.select([shape]);
      editor.repaint(true);
    } else {
      // repaint without selection if mouse left click
      editor.repaint(false);
    }

    // delegates to manipulators
    let cursor: [string, number] = [Cursor.DEFAULT, 0];
    if (editor.selection.size() > 1) {
      if (selectionsManipulator) {
        try {
          selectionsManipulator.pointerDown(editor, page, e);
          if (selectionsManipulator.mouseIn(editor, page, e)) {
            cursor =
              selectionsManipulator.mouseCursor(editor, page, e) ?? cursor;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (editor.selection.size() === 1) {
      const s = editor.selection.getShapes()[0];
      const manipulator = manipulatorManager.get(s.type);
      if (manipulator) {
        try {
          manipulator.pointerDown(editor, s, e);
          if (manipulator.mouseIn(editor, s, e)) {
            cursor = manipulator.mouseCursor(editor, s, e) ?? cursor;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (Array.isArray(cursor) && cursor.length > 1) {
      editor.setCursor(cursor[0], cursor[1]);
    } else {
      editor.setCursor(Cursor.DEFAULT);
    }
  }

  /**
   * handle pointer move event
   */
  pointerMove(editor: Editor, e: CanvasPointerEvent) {
    const canvas = editor.canvas;
    const page = editor.getCurrentPage();
    const p = canvas.globalCoordTransformRev([e.x, e.y]);
    editor.repaint(false); // do not draw selections

    if (page) {
      // selecting area
      if (this.dragging) {
        const p1 = canvas.globalCoordTransform(this.dragStartPoint);
        const p2 = canvas.globalCoordTransform(p);
        const rect = geometry.normalizeRect([p1, p2]);
        canvas.strokeColor = Color.SELECTION;
        canvas.strokeWidth = canvas.px * 1.5;
        canvas.strokePattern = [];
        canvas.roughness = 0;
        canvas.alpha = 1;
        canvas.strokeRect(rect[0][0], rect[0][1], rect[1][0], rect[1][1]);

        // hovering shapes overlaps selecting area
        for (let shape of page.children as Shape[]) {
          shape.visit((s) => {
            let box = geometry.normalizeRect([this.dragStartPoint, p]);
            if (s.enable && s.visible && s.overlapRect(canvas, box)) {
              const manipulator = manipulatorManager.get(s.type);
              if (manipulator) manipulator.drawHovering(editor, s, e);
            }
          });
        }

        // propagate drag event
        editor.onDrag.emit({ controller: null, dragPoint: p });
      } else if (!e.leftButtonDown) {
        // other shape hovering
        const shape = page.getShapeAt(canvas, p);
        if (shape && !editor.selection.isSelected(shape)) {
          guide.drawHovering(editor, shape, e);
        }
      }
    }

    // draw ghost over hovering
    editor.drawSelection();

    // delegates to manipulators
    let cursor: [string, number] = [Cursor.DEFAULT, 0];
    if (page) {
      if (editor.selection.size() > 1) {
        const manipulator = manipulatorManager.get("selections");
        if (manipulator) {
          try {
            const moved = manipulator.pointerMove(editor, page, e);
            if (moved) this.deselectOnPointerUp = [];
            if (manipulator.mouseIn(editor, page, e)) {
              cursor = manipulator.mouseCursor(editor, page, e) ?? cursor;
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
      if (editor.selection.size() === 1) {
        const s = editor.selection.getShapes()[0];
        const manipulator = manipulatorManager.get(s.type);
        if (manipulator) {
          try {
            const moved = manipulator.pointerMove(editor, s, e);
            if (moved) this.deselectOnPointerUp = [];
            if (manipulator.mouseIn(editor, s, e) || manipulator.isDragging()) {
              cursor = manipulator.mouseCursor(editor, s, e) ?? cursor;
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    if (Array.isArray(cursor) && cursor.length > 1) {
      editor.setCursor(cursor[0], cursor[1]);
    } else {
      editor.setCursor(Cursor.DEFAULT);
    }
  }

  /**
   * handle pointer up event
   */
  pointerUp(editor: Editor, e: CanvasPointerEvent) {
    editor.pointerDownUnselectedShape = false;
    const canvas = editor.canvas;
    const page = editor.getCurrentPage();
    const p = canvas.globalCoordTransformRev([e.x, e.y]);

    // deselect shapes marked to deselect
    if (this.deselectOnPointerUp.length > 0) {
      editor.selection.deselect(this.deselectOnPointerUp);
      this.deselectOnPointerUp = [];
    }

    // select area
    if (e.button === Mouse.BUTTON1 && this.dragging) {
      editor.selection.selectArea(
        this.dragStartPoint[0],
        this.dragStartPoint[1],
        p[0],
        p[1],
        !e.shiftDown
      );
    }

    // delegates to manipulators
    let cursor: [string, number] = [Cursor.DEFAULT, 0];
    if (page) {
      if (editor.selection.size() > 1) {
        const manipulator = manipulatorManager.get("selections");
        if (manipulator) {
          try {
            if (manipulator.mouseIn(editor, page, e)) {
              cursor = manipulator.mouseCursor(editor, page, e) ?? cursor;
            }
            manipulator.pointerUp(editor, page, e);
          } catch (e) {
            console.error(e);
          }
        }
      }
      if (editor.selection.size() === 1) {
        const s = editor.selection.getShapes()[0];
        const manipulator = manipulatorManager.get(s.type);
        if (manipulator) {
          try {
            if (manipulator.mouseIn(editor, s, e)) {
              cursor = manipulator.mouseCursor(editor, s, e) ?? cursor;
            }
            manipulator.pointerUp(editor, s, e);
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    if (Array.isArray(cursor) && cursor.length > 1) {
      editor.setCursor(cursor[0], cursor[1]);
    } else {
      editor.setCursor(Cursor.DEFAULT);
    }

    // clear states
    editor.repaint();

    if (this.dragging) {
      editor.onDragEnd.emit({ controller: null, dragPoint: p });
    }

    this.dragging = false;
    this.dragStartPoint = [-1, -1];

    // merge multiple actions of duplicated dragging into a single action
    if (editor.duplicatedDragging) {
      if (editor.transform.undoHistory.size() > 0) {
        const action1 = editor.transform.undoHistory.get();
        if (action1 && action1.name === ActionKind.MOVE) {
          if (editor.transform.undoHistory.size() > 1) {
            const action2 = editor.transform.undoHistory.get(1);
            if (action2 && action2.name === ActionKind.DUPLICATE) {
              editor.transform.mergeAction();
            }
          }
        } else if (action1 && action1.name === ActionKind.DUPLICATE) {
          editor.transform.undo();
        }
      }
      editor.duplicatedDragging = false;
    }
  }

  /**
   * keyDown
   */
  keyDown(editor: Editor, e: KeyboardEvent): boolean {
    // delegates to manipulators
    const page = editor.getCurrentPage();
    if (page) {
      if (editor.selection.size() === 1) {
        const shape = editor.selection.getShapes()[0];
        const manipulator = manipulatorManager.get(shape.type);
        if (manipulator) {
          try {
            manipulator.keyDown(editor, shape, e);
          } catch (e) {
            console.error(e);
          }
        }
      } else if (editor.selection.size() > 1) {
        const manipulator = manipulatorManager.get("selections");
        if (manipulator) {
          try {
            manipulator.keyDown(editor, page, e);
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
    if (e.key === "Escape") {
      this.dragging = false;
      this.dragStartPoint = [-1, -1];
      editor.selection.deselectAll();
      editor.repaint();
    }
    return false;
  }

  /**
   * keyUp
   */
  keyUp(editor: Editor, e: KeyboardEvent) {}

  /**
   * Draw ghost for the selected shape
   */
  drawSelection(editor: Editor) {
    const page = editor.getCurrentPage();
    if (page) {
      // delegates to manipulators
      if (editor.selection.size() > 1) {
        const manipulator = manipulatorManager.get("selections");
        if (manipulator) manipulator.draw(editor, page);
      }
      page.traverse((shape) => {
        const s = shape as Shape;
        const manipulator = manipulatorManager.get(s.type);
        if (manipulator && editor.selection.isSelected(s)) {
          manipulator.draw(editor, s);
        }
      });
    }
  }
}
