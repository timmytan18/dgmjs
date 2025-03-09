import { ActionKind, Store } from "./core";
import { Obj } from "./core/obj";
import { deserialize, serialize } from "./core/serialize";
import type { Editor } from "./editor";
import * as geometry from "./graphics/geometry";
import {
  addPage,
  addShape,
  bringForward,
  bringToFront,
  changeParent,
  deleteShapes,
  groupShapes,
  moveAnchor,
  moveShapes,
  removePage,
  reorderPage,
  resolveAllConstraints,
  sendBackward,
  sendToBack,
  ungroupShapes,
} from "./macro";
import {
  Box,
  Group,
  Mirror,
  Page,
  Path,
  Shape,
  type ShapeProps,
} from "./shapes";
import { visitTextNodes } from "./utils/text-utils";

/**
 * Extract outer refs in objs from the store
 */
export const outerRefMapExtractor = (
  store: Store,
  objs: Obj[]
): Record<string, Obj> => {
  const outerRefMap: Record<string, Obj> = {};
  for (const obj of objs) {
    obj.traverse((o) => {
      if (
        o instanceof Shape &&
        typeof o.reference === "string" &&
        store.idIndex[o.reference]
      ) {
        outerRefMap[o.reference] = store.idIndex[o.reference];
      }
      if (
        o instanceof Mirror &&
        typeof o.subject === "string" &&
        store.idIndex[o.subject]
      ) {
        outerRefMap[o.subject] = store.idIndex[o.subject];
      }
    });
  }
  return outerRefMap;
};

/**
 * Editor actions
 */
export class Actions {
  editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Undo
   */
  undo() {
    this.editor.transform.undo();
  }

  /**
   * Redo
   */
  redo() {
    this.editor.transform.redo();
  }

  /**
   * Add a page
   */
  addPage(position?: number): Page {
    const pages = this.editor.getPages();
    position = position ?? pages.length;
    const prevPage = pages[position - 1] ?? null;
    const page = new Page();
    page.size = prevPage?.size ?? null; // set size to the previous page's size
    page.name = `Page ${position + 1}`;
    this.editor.transform.startAction(ActionKind.ADD_PAGE);
    this.editor.transform.transact((tx) => {
      addPage(tx, this.editor.getDoc(), page);
      if (position >= 0 && position < this.editor.getPages().length) {
        reorderPage(tx, page, position);
      }
      resolveAllConstraints(tx, page, this.editor.canvas);
    });
    this.editor.transform.endAction();
    return page;
  }

  /**
   * Remove a page
   */
  removePage(page: Page) {
    this.editor.transform.startAction(ActionKind.REMOVE_PAGE);
    this.editor.transform.transact((tx) => {
      removePage(tx, page);
    });
    this.editor.transform.endAction();
  }

  /**
   * Reorder a page
   */
  reorderPage(page: Page, position: number) {
    this.editor.transform.startAction(ActionKind.REORDER_PAGE);
    this.editor.transform.transact((tx) => {
      reorderPage(tx, page, position);
    });
    this.editor.transform.endAction();
  }

  /**
   * Duplicate a page
   */
  duplicatePage(
    page: Page,
    position: number,
    initializer?: (page: Page) => void
  ): Page {
    const buffer: any[] = serialize([page]);
    const copied = deserialize(
      this.editor.store,
      buffer,
      outerRefMapExtractor
    )[0] as Page;
    if (initializer) initializer(copied);
    this.editor.transform.startAction(ActionKind.DUPLICATE_PAGE);
    this.editor.transform.transact((tx) => {
      addPage(tx, this.editor.getDoc(), copied);
      reorderPage(tx, copied, position);
    });
    this.editor.transform.endAction();
    this.editor.setCurrentPage(copied);
    return copied;
  }

  /**
   * Insert a shape into the current page or another shape
   * @param shape - The shape to insert
   * @param parent - The parent shape to insert the shape into. If not provided, the shape will be inserted into the current page
   */
  insert(shape: Shape, parent?: Shape) {
    const page = this.editor.getCurrentPage();
    if (page) {
      this.editor.transform.startAction(ActionKind.INSERT);
      this.editor.transform.transact((tx) => {
        addShape(tx, shape, parent ?? page);
        resolveAllConstraints(tx, page, this.editor.canvas);
      });
      this.editor.transform.endAction();
    }
  }

  /**
   * Update obj properties
   */
  update(values: ShapeProps, objs?: Obj[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      this.editor.transform.startAction(ActionKind.UPDATE);
      this.editor.transform.transact((tx) => {
        objs = objs ?? this.editor.selection.getShapes();
        for (const key in values) {
          const value = (values as any)[key];
          switch (key) {
            case "reference": {
              objs.forEach((s) => {
                if (s.hasOwnProperty(key)) tx.assignRef(s, key, value);
              });
              break;
            }
            case "subject": {
              objs.forEach((s) => {
                if (s.hasOwnProperty(key)) tx.assignRef(s, key, value);
              });
              break;
            }
            case "horzAlign":
              objs.forEach((s) => {
                if (s instanceof Box) {
                  const nodes = structuredClone(s.text);
                  visitTextNodes(nodes, (node) => {
                    if (node.attrs?.textAlign) node.attrs.textAlign = value;
                  });
                  if (s.hasOwnProperty(key)) {
                    tx.assign(s, key, value);
                    tx.assign(s, "text", nodes);
                  }
                }
              });
              break;
            case "fontColor":
            case "fontFamily":
            case "fontSize":
            case "fontWeight":
              objs.forEach((s) => {
                if (s instanceof Box) {
                  const nodes = structuredClone(s.text);
                  visitTextNodes(nodes, (node) => {
                    if (Array.isArray(node.marks)) {
                      node.marks.forEach((mark: any) => {
                        if (mark.attrs)
                          delete mark.attrs[
                            key === "fontColor" ? "color" : key
                          ];
                      });
                    }
                  });
                  if (s.hasOwnProperty(key)) {
                    tx.assign(s, key, value);
                    tx.assign(s, "text", nodes);
                  }
                }
              });
              break;
            default:
              objs.forEach((s) => {
                if (s.hasOwnProperty(key)) tx.assign(s, key, value);
              });
          }
        }
        resolveAllConstraints(tx, page, this.editor.canvas);
      });
      this.editor.transform.endAction();
    }
  }

  /**
   * Remove selected shapes
   */
  remove(shapes?: Shape[]) {
    const doc = this.editor.getDoc();
    const page = this.editor.getCurrentPage();
    if (page) {
      this.editor.transform.startAction(ActionKind.DELETE);
      this.editor.transform.transact((tx) => {
        shapes = shapes ?? this.editor.selection.getShapes();
        deleteShapes(tx, doc, page, shapes);
        resolveAllConstraints(tx, page, this.editor.canvas);
      });
      this.editor.transform.endAction();
      this.editor.selection.deselectAll();
    }
  }

  /**
   * Copy selected shapes
   */
  async copy(shapes?: Shape[]) {
    shapes = shapes ?? this.editor.selection.getShapes();
    const clipboard = this.editor.clipboard;
    await clipboard.write({
      objs: shapes,
    });
  }

  /**
   * Cut selected shapes
   */
  async cut(shapes?: Shape[]) {
    const doc = this.editor.getDoc();
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      const clipboard = this.editor.clipboard;
      await clipboard.write({
        objs: shapes,
      });
      this.editor.transform.startAction(ActionKind.CUT);
      this.editor.transform.transact((tx) => {
        deleteShapes(tx, doc, page, shapes!);
      });
      this.editor.transform.endAction();
      this.editor.selection.deselectAll();
    }
  }

  /**
   * Paste
   */
  async paste(page?: Page) {
    const currentPage = page ?? this.editor.getCurrentPage();
    if (currentPage) {
      const canvas = this.editor.canvas;
      const clipboard = this.editor.clipboard;
      const data = await clipboard.read(outerRefMapExtractor);
      const center = this.editor.getCenter();

      // paste shapes in clipboard
      if (Array.isArray(data.objs)) {
        const shapes = data.objs as Shape[];
        const boundingRect = shapes
          .map((s) => (s as Shape).getBoundingRect())
          .reduce(geometry.unionRect);
        const w = geometry.width(boundingRect);
        const h = geometry.height(boundingRect);
        const dx = center[0] - (boundingRect[0][0] + w / 2);
        const dy = center[1] - (boundingRect[0][1] + h / 2);
        this.editor.transform.startAction(ActionKind.PASTE);
        this.editor.transform.transact((tx) => {
          shapes.toReversed().forEach((shape) => {
            tx.appendObj(shape);
            changeParent(tx, shape, currentPage);
          });
          moveShapes(tx, currentPage, shapes, dx, dy);
        });
        this.editor.transform.endAction();
        this.editor.selection.select(shapes);
        return;
      }

      // paste image in clipboard
      if (data.image) {
        const shape = await this.editor.factory.createImage(data.image, center);
        this.editor.transform.startAction(ActionKind.PASTE);
        this.editor.transform.transact((tx) => {
          addShape(tx, shape, currentPage);
          resolveAllConstraints(tx, currentPage, canvas);
        });
        this.editor.transform.endAction();
        this.editor.selection.select([shape]);
        return;
      }

      // paste text in clipboard
      if (data.text) {
        const shape = this.editor.factory.createText(
          [center, center],
          data.text
        );

        // Set a default width for the text and enable word wrapping
        const defaultWidth = 500; // Default width for pasted text
        shape.width = defaultWidth;
        shape.wordWrap = true;

        // Allow the shape to be freely resizable
        shape.sizable = "free";

        // Only constrain the height to adjust based on content
        // This allows the width to be freely changed by the user
        shape.constraints = [
          {
            id: "set-size",
            width: "text-min", // Allow width to be manually resized but not smaller than text
            height: "text", // Height adjusts based on content
          },
        ];

        this.editor.transform.startAction(ActionKind.PASTE);
        this.editor.transform.transact((tx) => {
          addShape(tx, shape, currentPage);
          resolveAllConstraints(tx, currentPage, canvas);
        });
        this.editor.transform.endAction();
        this.editor.selection.select([shape]);
        return;
      }
    }
  }

  /**
   * Duplicate shapes
   * @param shapes - The shapes to duplicate. If not provided, the selected shapes will be duplicated
   * @param dx - The horizontal distance to move the duplicated shapes
   * @param dy - The vertical distance to move the duplicated shapes
   * @param parent - The parent shape to insert the duplicated shapes into. If not provided, the duplicated shapes will be inserted into the current page
   */
  duplicate(
    shapes?: Shape[],
    dx: number = 30,
    dy: number = 30,
    parent?: Shape
  ): Shape[] {
    const canvas = this.editor.canvas;
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      const buffer: any[] = serialize(shapes);
      if (buffer.length > 0) {
        const copied = deserialize(
          this.editor.store,
          buffer,
          outerRefMapExtractor
        ) as Shape[];
        this.editor.transform.startAction(ActionKind.DUPLICATE);
        this.editor.transform.transact((tx) => {
          copied.toReversed().forEach((shape) => {
            tx.appendObj(shape);
            changeParent(tx, shape, parent ?? page);
          });
          moveShapes(tx, page, copied, dx, dy);
          resolveAllConstraints(tx, page, canvas);
        });
        this.editor.transform.endAction();
        this.editor.selection.select(copied);
        return copied;
      }
    }
    return [];
  }

  /**
   * Move selected shapes
   */
  move(dx: number, dy: number, shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.MOVE);
        this.editor.transform.transact((tx) => {
          if (shapes!.every((s) => s instanceof Box && s.anchored)) {
            for (const s of shapes!) {
              if (s instanceof Box && s.anchored) {
                const anchorPoint = geometry.getPointOnPath(
                  (s.parent as Shape).getOutline() ?? [],
                  s.anchorPosition
                );
                const shapeCenter = s.getCenter();
                shapeCenter[0] += dx;
                shapeCenter[1] += dy;
                const angle = geometry.angle(anchorPoint, shapeCenter);
                const length = Math.round(
                  geometry.distance(shapeCenter, anchorPoint)
                );
                moveAnchor(tx, s, angle, length);
              }
            }
          } else {
            moveShapes(tx, page, shapes!, dx, dy);
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Group selected shapes
   */
  group(shapes?: Shape[]) {
    const doc = this.editor.getDoc();
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      let group: Group | null = null;
      this.editor.transform.startAction(ActionKind.GROUP);
      this.editor.transform.transact((tx) => {
        groupShapes(tx, doc, page, this.editor.canvas, shapes!);
        group = tx.recentlyAppendedObj as Group;
        resolveAllConstraints(tx, page, this.editor.canvas);
      });
      this.editor.transform.endAction();
      if (group) this.editor.selection.select([group]);
    }
  }

  /**
   * Ungroup selected shapes
   */
  ungroup(shapes?: Shape[]) {
    const doc = this.editor.getDoc();
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.some((s) => s instanceof Group)) {
        const children = shapes
          .filter((s) => s instanceof Group)
          .flatMap((g) => g.children as Shape[]);
        this.editor.transform.startAction(ActionKind.UNGROUP);
        this.editor.transform.transact((tx) => {
          ungroupShapes(tx, doc, page, this.editor.canvas, shapes!);
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
        this.editor.selection.select(children);
      }
    }
  }

  /**
   * Bring selected shapes to front
   */
  bringToFront(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.BRING_TO_FRONT);
        this.editor.transform.transact((tx) => {
          for (const s of shapes!) {
            bringToFront(tx, s);
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Send selected shapes to back
   */
  sendToBack(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.SEND_TO_BACK);
        this.editor.transform.transact((tx) => {
          for (const s of shapes!) {
            sendToBack(tx, s);
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Bring selected shapes forward
   */
  bringForward(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.BRING_FORWARD);
        this.editor.transform.transact((tx) => {
          for (const s of shapes!) {
            bringForward(tx, s);
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Send selected shapes backward
   */
  sendBackward(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.SEND_BACKWARD);
        this.editor.transform.transact((tx) => {
          for (const s of shapes!) {
            sendBackward(tx, s);
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to left
   */
  alignLeft(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_LEFT);
        this.editor.transform.transact((tx) => {
          const ls = shapes!.map((s) => s.getBoundingRect()[0][0]);
          const left = Math.min(...ls);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dx = left - s.left;
              moveShapes(tx, page, [s], dx, 0);
            } else if (s instanceof Path) {
              const dx = left - Math.min(...s.path.map((p) => p[0]));
              moveShapes(tx, page, [s], dx, 0);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to right
   */
  alignRight(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_RIGHT);
        this.editor.transform.transact((tx) => {
          const rs = shapes!.map((s) => s.getBoundingRect()[1][0]);
          const right = Math.max(...rs);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dx = right - s.right;
              moveShapes(tx, page, [s], dx, 0);
            } else if (s instanceof Path) {
              const dx = right - Math.max(...s.path.map((p) => p[0]));
              moveShapes(tx, page, [s], dx, 0);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to horizontally center
   */
  alignCenter(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_CENTER);
        this.editor.transform.transact((tx) => {
          const ls = shapes!.map((s) => s.getBoundingRect()[0][0]);
          const rs = shapes!.map((s) => s.getBoundingRect()[1][0]);
          const left = Math.min(...ls);
          const right = Math.max(...rs);
          const center = Math.round((left + right) / 2);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dx = center - Math.round((s.left + s.right) / 2);
              moveShapes(tx, page, [s], dx, 0);
            } else if (s instanceof Path) {
              const l = Math.min(...s.path.map((p) => p[0]));
              const r = Math.max(...s.path.map((p) => p[0]));
              const dx = center - Math.round((l + r) / 2);
              moveShapes(tx, page, [s], dx, 0);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to top
   */
  alignTop(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_TOP);
        this.editor.transform.transact((tx) => {
          const ts = shapes!.map((s) => s.getBoundingRect()[0][1]);
          const top = Math.min(...ts);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dy = top - s.top;
              moveShapes(tx, page, [s], 0, dy);
            } else if (s instanceof Path) {
              const dy = top - Math.min(...s.path.map((p) => p[1]));
              moveShapes(tx, page, [s], 0, dy);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to bottom
   */
  alignBottom(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_BOTTOM);
        this.editor.transform.transact((tx) => {
          const bs = shapes!.map((s) => s.getBoundingRect()[1][1]);
          const bottom = Math.max(...bs);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dy = bottom - s.bottom;
              moveShapes(tx, page, [s], 0, dy);
            } else if (s instanceof Path) {
              const dy = bottom - Math.max(...s.path.map((p) => p[1]));
              moveShapes(tx, page, [s], 0, dy);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes to vertically middle
   */
  alignMiddle(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      if (shapes.length > 0) {
        this.editor.transform.startAction(ActionKind.ALIGN_MIDDLE);
        this.editor.transform.transact((tx) => {
          const ts = shapes!.map((s) => s.getBoundingRect()[0][1]);
          const bs = shapes!.map((s) => s.getBoundingRect()[1][1]);
          const top = Math.min(...ts);
          const bottom = Math.max(...bs);
          const middle = Math.round((top + bottom) / 2);
          for (const s of shapes!) {
            if (s instanceof Box) {
              const dy = middle - Math.round((s.top + s.bottom) / 2);
              moveShapes(tx, page, [s], 0, dy);
            } else if (s instanceof Path) {
              const t = Math.min(...s.path.map((p) => p[1]));
              const b = Math.max(...s.path.map((p) => p[1]));
              const dy = middle - Math.round((t + b) / 2);
              moveShapes(tx, page, [s], 0, dy);
            }
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes horizontally with space around
   */
  alignHorizontalSpaceAround(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      const orderedShapes = shapes.sort(
        (a, b) => a.getBoundingRect()[0][0] - b.getBoundingRect()[0][0]
      );
      if (orderedShapes.length > 0) {
        const ls = orderedShapes!.map((s) => s.getBoundingRect()[0][0]);
        const rs = orderedShapes!.map((s) => s.getBoundingRect()[1][0]);
        const ws = orderedShapes!.map((s) =>
          geometry.width(s.getBoundingRect())
        );
        const left = Math.min(...ls);
        const right = Math.max(...rs);
        const width = right - left;
        const sum = ws.reduce((a, b) => a + b, 0);
        const gap = (width - sum) / (orderedShapes.length - 1);
        this.editor.transform.startAction(ActionKind.DISTRIBUTE_HORIZONTALLY);
        this.editor.transform.transact((tx) => {
          let x = left;
          for (let i = 0; i < orderedShapes.length; i++) {
            const s = orderedShapes[i];
            if (s instanceof Box) {
              const dx = x - s.left;
              moveShapes(tx, page, [s], dx, 0);
            } else if (s instanceof Path) {
              const l = Math.min(...s.path.map((p) => p[0]));
              const dx = x - l;
              moveShapes(tx, page, [s], dx, 0);
            }
            x += ws[i] + gap;
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }

  /**
   * Align selected shapes vertically with space around
   */
  alignVerticalSpaceAround(shapes?: Shape[]) {
    const page = this.editor.getCurrentPage();
    if (page) {
      shapes = shapes ?? this.editor.selection.getShapes();
      const orderedShapes = shapes.sort(
        (a, b) => a.getBoundingRect()[0][1] - b.getBoundingRect()[0][1]
      );
      if (orderedShapes.length > 0) {
        const ts = orderedShapes!.map((s) => s.getBoundingRect()[0][1]);
        const bs = orderedShapes!.map((s) => s.getBoundingRect()[1][1]);
        const hs = orderedShapes!.map((s) =>
          geometry.height(s.getBoundingRect())
        );
        const top = Math.min(...ts);
        const bottom = Math.max(...bs);
        const height = bottom - top;
        const sum = hs.reduce((a, b) => a + b, 0);
        const gap = (height - sum) / (orderedShapes.length - 1);
        this.editor.transform.startAction(ActionKind.DISTRIBUTE_VERTICALLY);
        this.editor.transform.transact((tx) => {
          let y = top;
          for (let i = 0; i < orderedShapes.length; i++) {
            const s = orderedShapes[i];
            if (s instanceof Box) {
              const dy = y - s.top;
              moveShapes(tx, page, [s], 0, dy);
            } else if (s instanceof Path) {
              const t = Math.min(...s.path.map((p) => p[1]));
              const dy = y - t;
              moveShapes(tx, page, [s], 0, dy);
            }
            y += hs[i] + gap;
          }
          resolveAllConstraints(tx, page, this.editor.canvas);
        });
        this.editor.transform.endAction();
      }
    }
  }
}
