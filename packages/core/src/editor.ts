import { Actions } from "./actions";
import { themeColors } from "./colors";
import { Clipboard } from "./core/clipboard";
import type { Obj } from "./core/obj";
import { Store } from "./core/store";
import { Transform } from "./core/transform";
import { ShapeFactory } from "./factory";
import { Color, CONTROL_POINT_APOTHEM, Cursor, Mouse } from "./graphics/const";
import * as geometry from "./graphics/geometry";
import { Canvas, CanvasPointerEvent, FillStyle } from "./graphics/graphics";
import * as utils from "./graphics/utils";
import { KeyMap, KeymapManager } from "./keymap-manager";
import { SelectionManager } from "./selection-manager";
import { Connector, Doc, Page, Shape, shapeInstantiator } from "./shapes";
import { assert } from "./std/assert";
import { TypedEvent } from "./std/typed-event";
import { AutoScroller } from "./utils/auto-scroller";

export interface EditorOptions {
  handlers: Handler[];
  defaultHandlerId: string | null;
  keymap: KeyMap;
  keymapEventTarget: EventTarget | null;
  allowAutoScroll: boolean;
  allowCreateTextOnCanvas: boolean;
  allowCreateTextOnConnector: boolean;
  showCreateConnectorController: boolean;
  showDOM: boolean;
  imageResize: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
  blankColor?: string;
  canvasColor?: string;
  gridColor?: string;
  onReady: (editor: Editor) => void;
}

export interface DblClickEvent {
  shape: Shape | null;
  point: number[];
}

export interface DragEvent {
  controller: Controller | null;
  dragPoint: number[];
}

export interface FileDropEvent {
  event: CanvasPointerEvent;
  dataTransfer: DataTransfer;
}

/**
 * Create a touch event
 * @param element A <canvas> HTML element
 * @param canvas A canvas object
 * @param e An event of canvas element
 */
function createTouchEvent(
  element: HTMLCanvasElement,
  canvas: Canvas,
  e: TouchEvent
): CanvasPointerEvent {
  const rect = element.getBoundingClientRect();
  // average of touch points if multi-touch
  const cx =
    e.touches.length === 2
      ? (e.touches[0].clientX + e.touches[1].clientX) / 2
      : e.touches[0].clientX;
  const cy =
    e.touches.length === 2
      ? (e.touches[0].clientY + e.touches[1].clientY) / 2
      : e.touches[0].clientY;
  const _p = [cx - rect.left, cy - rect.top];
  // transform pointer event point to CCS (canvas coord-system)
  const p = [_p[0] * canvas.ratio, _p[1] * canvas.ratio];
  const options = {
    button: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    touchDistance: 0,
  };
  if (e.touches.length === 2) {
    const xd = e.touches[0].clientX - e.touches[1].clientX;
    const yd = e.touches[0].clientY - e.touches[1].clientY;
    options.touchDistance = Math.sqrt(xd * xd + yd * yd);
  }
  return new CanvasPointerEvent(p[0], p[1], options);
}

/**
 * Create a pointer event
 * @param element A <canvas> HTML element
 * @param canvas A canvas object
 * @param e An event of canvas element
 */
function createPointerEvent(
  element: HTMLCanvasElement,
  canvas: Canvas,
  e: MouseEvent
): CanvasPointerEvent {
  const rect = element.getBoundingClientRect();
  const _p = [e.clientX - rect.left, e.clientY - rect.top];
  // transform pointer event point to CCS (canvas coord-system)
  const p = [_p[0] * canvas.ratio, _p[1] * canvas.ratio];
  return new CanvasPointerEvent(p[0], p[1], e);
}

/**
 * The editor
 */
export class Editor {
  /**
   * The editor options
   */
  options: EditorOptions;

  /**
   * The plugins
   */
  plugins: Record<string, Plugin>;

  /**
   * The platform
   */
  platform: string;

  /**
   * The event emitter for current page change
   */
  onCurrentPageChange: TypedEvent<Page>;

  /**
   * The event emitter for active handler change
   */
  onActiveHandlerChange: TypedEvent<string>;

  /**
   * The event emitter for active handler lock change
   */
  onActiveHandlerLockChange: TypedEvent<boolean>;

  /**
   * The event emitter for zoom
   */
  onZoom: TypedEvent<number>;

  /**
   * The event emitter for scroll
   */
  onScroll: TypedEvent<number[]>;

  /**
   * The event emitter for pointer down
   */
  onPointerDown: TypedEvent<CanvasPointerEvent>;

  /**
   * The event emitter for pointer move
   */
  onPointerMove: TypedEvent<CanvasPointerEvent>;

  /**
   * The event emitter for pointer up
   */
  onPointerUp: TypedEvent<CanvasPointerEvent>;

  /**
   * The event emitter for double click
   */
  onDblClick: TypedEvent<DblClickEvent>;

  /**
   * The event emitter for key down
   */
  onKeyDown: TypedEvent<KeyboardEvent>;

  /**
   * The event emitter for key up
   */
  onKeyUp: TypedEvent<KeyboardEvent>;

  /**
   * The event emitter for drag start
   */
  onDragStart: TypedEvent<DragEvent>;

  /**
   * The event emitter for drag
   */
  onDrag: TypedEvent<DragEvent>;

  /**
   * The event emitter for drag end
   */
  onDragEnd: TypedEvent<DragEvent>;

  /**
   * The event emitter for file drop
   */
  onFileDrop: TypedEvent<FileDropEvent>;

  /**
   * The event emitter for repaint
   */
  onRepaint: TypedEvent<void>;

  /**
   * The store object
   */
  store: Store;

  /**
   * The transform object
   */
  transform: Transform;

  /**
   * The clipboard object
   */
  clipboard: Clipboard;

  /**
   * The selection manager
   */
  selection: SelectionManager;

  /**
   * The shape factory
   */
  factory: ShapeFactory;

  /**
   * The actions
   */
  actions: Actions;

  /**
   * The keymap manager
   */
  keymap: KeymapManager;

  /**
   * The auto scroller
   */
  private autoScroller: AutoScroller;

  /**
   * The parent element
   */
  parent: HTMLElement;

  /**
   * The canvas element
   */
  canvasElement: HTMLCanvasElement;

  /**
   * The canvas object
   */
  canvas: Canvas;

  /**
   * The current page
   */
  private currentPage: Page | null;

  /**
   * The enabled state
   */
  private enabled: boolean;

  /**
   * The dark mode
   */
  private darkMode: boolean;

  /**
   * The grid size
   */
  private gridSize: number[];

  /**
   * The show grid option
   */
  private showGrid: boolean;

  /**
   * The snap to grid option
   */
  private snapToGrid: boolean;

  /**
   * The snap to objects option
   */
  private snapToObjects: boolean;

  /**
   * The handlers
   */
  private handlers: Record<string, Handler>;

  /**
   * The active handler
   */
  private activeHandler: Handler | null;

  /**
   * The active handler lock
   */
  private activeHandlerLock: boolean;

  /**
   * @private
   */
  spaceKeyDown: boolean;

  /**
   * @private
   */
  leftButtonDown: boolean;

  /**
   * @private
   */
  midButtonDown: boolean;

  /**
   * @private
   *
   * This indicates that the user has mouse pointer down on an unselected shape.
   * This is required to deactivate controllers (box-sizing) before the shape is
   * clearly selected after mouse pointer up.
   *
   * When the shape is too small, it is so hard to move the shape because the
   * box-sizing controller is activated. This flag is used to prevent this issue.
   * (See issue #169)
   */
  pointerDownUnselectedShape: boolean;

  /**
   * @private
   *
   * This indicates that the duplicated shape(s) are dragging
   * by (alt/opt + mouse) or not.
   */
  duplicatedDragging: boolean = false;

  private downX: number;
  private downY: number;
  private isPinching: boolean;
  private initialScale: number;
  private initialDistance: number;
  private touchPoint: number[];

  /**
   * constructor
   */
  constructor(
    editorHolder: HTMLElement,
    options: Partial<EditorOptions>,
    plugins: Plugin[] = []
  ) {
    this.options = {
      handlers: [],
      defaultHandlerId: "",
      keymap: {},
      keymapEventTarget: null,
      allowAutoScroll: true,
      allowCreateTextOnCanvas: true,
      allowCreateTextOnConnector: true,
      showCreateConnectorController: true,
      showDOM: true,
      imageResize: {
        quality: 0.7,
        maxWidth: 800,
        maxHeight: 800,
      },
      blankColor: Color.BLANK,
      canvasColor: Color.CANVAS,
      gridColor: Color.GRID,
      onReady: () => {},
      ...options,
    };

    // register plugins
    this.plugins = {};
    plugins.forEach((plugin) => {
      this.plugins[plugin.id] = plugin;
    });

    // initialize event emitters
    this.onCurrentPageChange = new TypedEvent();
    this.onActiveHandlerChange = new TypedEvent();
    this.onActiveHandlerLockChange = new TypedEvent();
    this.onZoom = new TypedEvent();
    this.onScroll = new TypedEvent();
    this.onPointerDown = new TypedEvent();
    this.onPointerMove = new TypedEvent();
    this.onPointerUp = new TypedEvent();
    this.onDblClick = new TypedEvent();
    this.onKeyDown = new TypedEvent();
    this.onKeyUp = new TypedEvent();
    this.onDragStart = new TypedEvent();
    this.onDrag = new TypedEvent();
    this.onDragEnd = new TypedEvent();
    this.onFileDrop = new TypedEvent();
    this.onRepaint = new TypedEvent();

    this.store = new Store(shapeInstantiator, {
      objInitializer: (o) => {
        if (o instanceof Shape) {
          o.initialze(this.canvas);
          o.update(this.canvas);
        }
      },
      objFinalizer: (o) => {
        if (o instanceof Shape) o.finalize(this.canvas);
      },
      objUpdater: (obj) => {
        if (obj instanceof Shape) obj.update(this.canvas);
      },
    });
    this.transform = new Transform(this.store);
    this.clipboard = new Clipboard(this.store);
    this.selection = new SelectionManager(this);
    this.factory = new ShapeFactory(this);
    this.actions = new Actions(this);
    this.keymap = new KeymapManager(this);

    this.platform = this.detectPlatform();
    this.currentPage = null;
    this.parent = editorHolder;
    this.parent.style.overflow = "hidden";
    this.autoScroller = new AutoScroller(this);
    this.autoScroller.setEnabled(this.options.allowAutoScroll ?? true);
    // initialize properties
    this.canvasElement = null as any;
    this.canvas = null as any;
    this.enabled = true;
    this.darkMode = false;
    this.gridSize = [8, 8];
    this.showGrid = true;
    this.snapToGrid = false;
    this.snapToObjects = false;
    this.handlers = {};
    this.activeHandler = null;
    this.activeHandlerLock = false;
    this.spaceKeyDown = false;
    this.leftButtonDown = false;
    this.midButtonDown = false;
    this.downX = 0;
    this.downY = 0;
    this.isPinching = false;
    this.initialScale = 1;
    this.initialDistance = 0;
    this.touchPoint = [-1, -1];
    this.pointerDownUnselectedShape = false;
    this.initializeState();
    this.initializeHandlers();
    this.initializeCanvas();
    this.initializeKeymap();
    this.activatePlugins();
    if (this.options.onReady) this.options.onReady(this);
  }

  private detectPlatform(): string {
    const p = navigator.platform.toLowerCase();
    if (p.indexOf("mac") > -1) {
      return "darwin";
    } else if (p.indexOf("win") > -1) {
      return "win32";
    } else if (p.indexOf("linux") > -1) {
      return "linux";
    }
    return "unknown";
  }

  /**
   * Calculate pan speed based on current scale
   * @param scale Current zoom scale
   * @returns [scaleFactor, baseSpeed] tuple
   */
  private calculatePanSpeed(scale: number): number {
    // Logarithmic scaling provides more natural feeling speed changes
    // Add 1 to avoid negative values when scale > 1
    return Math.log(1 / scale + 1);
  }

  private initializeState() {
    this.selection.onChange.addListener(() => this.repaint());
    this.transform.onTransaction.addListener(() => this.repaint());
    this.transform.onUndo.addListener(() => {
      if (this.activeHandler) this.activeHandler.onActionPerformed(this);
      this.repaint();
    });
    this.transform.onRedo.addListener(() => {
      if (this.activeHandler) this.activeHandler.onActionPerformed(this);
      this.repaint();
    });
    this.transform.onAction.addListener(() => {
      if (this.activeHandler) this.activeHandler.onActionPerformed(this);
    });
  }

  private initializeHandlers() {
    this.options.handlers.forEach((handler) => {
      this.handlers[handler.id] = handler;
    });
    if (!this.options.defaultHandlerId && this.options.handlers.length > 0) {
      this.options.defaultHandlerId = this.options.handlers[0].id;
    }
  }

  private initializeCanvas() {
    this.canvasElement = document.createElement("canvas");
    this.canvasElement.tabIndex = 0; // enable focus
    this.canvasElement.style.touchAction = "none"; // prevent pointer cancel event in mobile
    this.canvasElement.style.outline = "none"; // remove focus outline
    this.parent.appendChild(this.canvasElement);
    // const context = this.canvasElement.getContext("2d");
    // if (!context) throw new Error("Failed to create context2d");
    const pixelRatio = window.devicePixelRatio ?? 1;
    this.canvas = new Canvas(this.canvasElement, pixelRatio);
    this.canvas.colorVariables = { ...themeColors["light"] };

    // pointer down handler
    this.canvasElement.addEventListener("pointerdown", (e) => {
      if (this.enabled) {
        this.focus();
        if (e.button === Mouse.BUTTON1) this.leftButtonDown = true;
        if (e.button === Mouse.BUTTON2) this.midButtonDown = true;
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        this.autoScroller.pointerDown(event);
        if (this.spaceKeyDown) {
          this.setCursor(Cursor.GRAB);
        }
        if (this.midButtonDown || (this.spaceKeyDown && this.leftButtonDown)) {
          // viewpoint move
          this.setCursor(Cursor.GRABBING);
          this.downX = e.offsetX;
          this.downY = e.offsetY;
        } else if (
          !this.isPinching &&
          !this.spaceKeyDown &&
          this.activeHandler
        ) {
          // In mobile devices pointerMove is not triggered, so need to trigger pointerMove once
          this.activeHandler.pointerMove(this, event);
          this.activeHandler.pointerDown(this, event);
        }
        this.onPointerDown.emit(event);
      }
    });

    // pointer move
    this.canvasElement.addEventListener("pointermove", (e) => {
      if (this.enabled) {
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        event.leftButtonDown = this.leftButtonDown;
        this.autoScroller.pointerMove(event);
        if (this.spaceKeyDown) {
          this.setCursor(Cursor.GRAB);
        }
        if (this.midButtonDown || (this.spaceKeyDown && this.leftButtonDown)) {
          // viewpoint move
          this.setCursor(Cursor.GRABBING);
          const scale = this.getScale();
          const scaleFactor = this.calculatePanSpeed(scale);
          const dx = (e.offsetX - this.downX) * scaleFactor;
          const dy = (e.offsetY - this.downY) * scaleFactor;
          this.moveOrigin(dx, dy);
          this.downX = e.offsetX;
          this.downY = e.offsetY;
        } else if (
          !this.isPinching &&
          !this.spaceKeyDown &&
          this.activeHandler
        ) {
          this.activeHandler.pointerMove(this, event);
        }
        this.onPointerMove.emit(event);
      }
    });

    // pointer up  handler
    this.canvasElement.addEventListener("pointerup", (e) => {
      if (this.enabled) {
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        if (this.spaceKeyDown) {
          this.setCursor(Cursor.GRAB);
        }
        if (this.midButtonDown || (this.spaceKeyDown && this.leftButtonDown)) {
          this.downX = 0;
          this.downY = 0;
        }
        this.autoScroller.pointerUp(event);
        if (!this.isPinching && !this.spaceKeyDown && this.activeHandler) {
          this.activeHandler.pointerUp(this, event);
        }
        if (e.button === Mouse.BUTTON1) this.leftButtonDown = false;
        if (e.button === Mouse.BUTTON2) this.midButtonDown = false;
        this.onPointerUp.emit(event);
      }
    });

    this.canvasElement.addEventListener("pointercancel", (e) => {
      if (this.enabled) {
      }
    });

    // touch start handler
    this.canvasElement.addEventListener("touchstart", (e) => {
      if (this.enabled) {
        this.focus();
        if (e.touches.length === 2) {
          const event = createTouchEvent(this.canvasElement, this.canvas, e);
          this.isPinching = true;
          this.initialScale = this.canvas.scale;
          this.initialDistance = event.touchDistance;
          this.touchPoint = [event.x, event.y];
        }
      }
    });

    // touch move handler
    this.canvasElement.addEventListener("touchmove", (e) => {
      if (this.enabled) {
        if (this.isPinching && e.touches.length === 2) {
          const event = createTouchEvent(this.canvasElement, this.canvas, e);
          const currentDistance = event.touchDistance;
          const scale = (currentDistance / this.initialDistance) * 1.5;
          const p1 = this.canvas.globalCoordTransformRev(this.touchPoint);
          this.setScale(this.initialScale * scale);
          const p2 = this.canvas.globalCoordTransformRev([event.x, event.y]);
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const currentScale = this.getScale();
          const scaleFactor = this.calculatePanSpeed(currentScale);
          this.moveOrigin(dx * scaleFactor, dy * scaleFactor);
          this.touchPoint = [event.x, event.y];
        }
      }
    });

    // touch end handler
    this.canvasElement.addEventListener("touchend", (e) => {
      if (this.enabled) {
        e.stopImmediatePropagation();
        this.isPinching = false;
        this.initialScale = 1;
        this.initialDistance = 0;
        this.touchPoint = [-1, -1];
      }
    });

    // mouse double click
    this.canvasElement.addEventListener("dblclick", (e) => {
      if (this.enabled) {
        this.focus();
        this.selection.deselectAll();
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        const p = this.canvas.globalCoordTransformRev([event.x, event.y]);
        const x = p[0];
        const y = p[1];
        if (this.currentPage) {
          // allows double click on a disable shape (e.g. a text inside another shape)
          const pred = (s: Obj) =>
            (s as Shape).visible && (s as Shape).containsPoint(this.canvas, p);
          const shape: Shape | null = this.currentPage.findDepthFirst(
            pred
          ) as Shape | null;
          // create a text on canvas
          if (this.options.allowCreateTextOnCanvas && !shape) {
            // Define fixed size for text shape (matching TextFactoryHandler)
            const DEFAULT_WIDTH = 350;
            const DEFAULT_HEIGHT = 150;

            // Create rectangle with proper dimensions
            const rect = [
              [x, y],
              [x + DEFAULT_WIDTH, y + DEFAULT_HEIGHT],
            ];

            // Create text shape with the properly sized rectangle
            const textShape = this.factory.createText(rect, "");

            // Ensure the text is properly configured
            if (textShape) {
              // Force explicit dimensions
              textShape.width = DEFAULT_WIDTH;
              textShape.height = DEFAULT_HEIGHT;

              // Make sure it's user-resizable
              textShape.sizable = "free";

              // Remove any constraints that might affect dimensions
              textShape.constraints = [];

              // Ensure the text is editable
              textShape.textEditable = true;
            }

            // Insert the shape
            this.actions.insert(textShape);

            // Force a repaint for better visibility
            this.repaint();

            // Trigger the editor
            this.factory.triggerCreate(textShape);
          }
          // create a text on connector
          if (
            this.options.allowCreateTextOnConnector &&
            shape instanceof Connector
          ) {
            const outline = shape.getOutline();
            const nearest = geometry.findNearestOnPath(
              [x, y],
              outline,
              CONTROL_POINT_APOTHEM * 2
            );
            const position = nearest
              ? geometry.getPositionOnPath(outline, nearest)
              : 0.5;
            const textShape = this.factory.createAnchoredText(position);
            this.actions.insert(textShape, shape);
            this.factory.triggerCreate(textShape);
          }
          // trigger double click event
          this.onDblClick.emit({ shape, point: [x, y] });
        }
      }
    });

    // mouse wheel event
    this.canvasElement.addEventListener("wheel", (e) => {
      if (this.enabled) {
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        const dx = -e.deltaX;
        const dy = -e.deltaY;
        const h = this.getSize()[1] / (this.canvas.px * 2);
        const zoomScale = 0.15;
        if (e.ctrlKey || e.metaKey) {
          // zoom with wheel
          e.preventDefault();
          if (dy < 0) {
            const p1 = this.canvas.globalCoordTransformRev([event.x, event.y]);
            this.setScale(this.canvas.scale * (1 + dy / (h * zoomScale)));
            const p2 = this.canvas.globalCoordTransformRev([event.x, event.y]);
            this.moveOrigin(p2[0] - p1[0], p2[1] - p1[1]);
          } else if (dy > 0) {
            const p1 = this.canvas.globalCoordTransformRev([event.x, event.y]);
            this.setScale(this.canvas.scale * (1 + dy / (h * zoomScale)));
            const p2 = this.canvas.globalCoordTransformRev([event.x, event.y]);
            this.moveOrigin(p2[0] - p1[0], p2[1] - p1[1]);
          }
        } else if (e.shiftKey && Math.abs(dx) === 0) {
          // horizontal scroll (only for non macOS)
          const scale = this.getScale();
          const scaleFactor = this.calculatePanSpeed(scale);
          this.moveOrigin(dy * scaleFactor, dx * scaleFactor);
        } else {
          // vertical scroll
          const scale = this.getScale();
          const scaleFactor = this.calculatePanSpeed(scale);
          this.moveOrigin(dx * scaleFactor, dy * scaleFactor);
        }
      }
      e.preventDefault();
    });

    // mouse drag over event
    this.canvasElement.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    // mouse drag drop event
    this.canvasElement.addEventListener("drop", (e) => {
      if (this.enabled) {
        this.focus();
        e.preventDefault();
        const event = createPointerEvent(this.canvasElement, this.canvas, e);
        // const files = Array.from(e.dataTransfer?.files ?? []);
        this.onFileDrop.emit({
          event,
          dataTransfer: e.dataTransfer as DataTransfer,
        });
      }
    });

    // key down event
    this.canvasElement.addEventListener("keydown", (e) => {
      if (this.enabled) {
        e.preventDefault();
        if (e.code === "Space" && this.spaceKeyDown === false) {
          this.spaceKeyDown = true;
          this.setCursor(Cursor.GRAB);
        }
        this.focus();
        this.onKeyDown.emit(e);
      }
    });

    // key up event
    this.canvasElement.addEventListener("keyup", (e) => {
      if (this.enabled) {
        e.preventDefault();
        if (e.code === "Space" && this.spaceKeyDown === true) {
          this.spaceKeyDown = false;
          this.setCursor(Cursor.DEFAULT);
        }
        this.focus();
        this.onKeyUp.emit(e);
      }
    });
  }

  private initializeKeymap() {
    this.keymap.bind(this.options.keymap ?? {});
    // handle global key events
    this.canvasElement.addEventListener("keydown", (e) => {
      if (this.enabled) {
        if (this.activeHandler) {
          this.activeHandler.keyDown(this, e);
        }
        if (e.key === "Escape" && this.options.defaultHandlerId) {
          this.activateHandler(this.options.defaultHandlerId);
        }
      }
    });
    this.canvasElement.addEventListener("keyup", (e) => {
      if (this.enabled) {
        if (this.activeHandler) {
          this.activeHandler.keyUp(this, e);
        }
      }
    });
  }

  /**
   * Activate plugins
   */
  private activatePlugins() {
    for (const plugin of Object.values(this.plugins)) {
      plugin.activate(this);
    }
  }

  /**
   * Deactivate plugins
   */
  private deactivatePlugins() {
    for (const plugin of Object.values(this.plugins)) {
      plugin.deactivate(this);
    }
  }

  /**
   * Get a plugin by id
   */
  getPlugin(id: string): Plugin | null {
    return this.plugins[id];
  }

  /**
   * Get enabled state
   */
  getEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.canvasElement.style.opacity = enabled ? "1" : "0.5";
  }

  /**
   * Get current page
   */
  getCurrentPage(): Page | null {
    return this.currentPage;
  }

  /**
   * Set current page
   */
  setCurrentPage(page: Page) {
    if (this.currentPage !== page) {
      if (this.currentPage) {
        this.currentPage.finalize(this.canvas);
        this.selection.deselectAll();
      }
      this.currentPage = page;
      if (page.pageOrigin) {
        this.setOrigin(page.pageOrigin[0], page.pageOrigin[1]);
      } else {
        this.scrollToCenter();
        this.currentPage.pageOrigin = this.getOrigin();
      }
      this.setScale(page.pageScale);
      this.repaint();
      this.onCurrentPageChange.emit(page);
    }
  }

  /**
   * Get pages
   */
  getPages(): Page[] {
    if (this.store.root) {
      return this.store.root.children as Page[];
    }
    return [];
  }

  /**
   * Set focus on this editor
   */
  focus() {
    this.canvasElement.focus();
  }

  /**
   * Get dark mode
   */
  getDarkMode(): boolean {
    return this.darkMode;
  }

  /**
   * Set dark mode
   */
  setDarkMode(dark: boolean) {
    this.darkMode = dark;
    this.canvas.colorVariables = {
      ...themeColors[this.darkMode ? "dark" : "light"],
    };
    this.update();
    this.repaint();
  }

  /**
   * Get grid size
   */
  getGridSize(): number[] {
    return this.gridSize;
  }

  /**
   * Set grid size
   */
  setGridSize(gridSize: number[]) {
    this.gridSize = gridSize;
    this.repaint();
  }

  /**
   * Get show grid state
   */
  getShowGrid(): boolean {
    return this.showGrid;
  }

  /**
   * Set show grid or not
   */
  setShowGrid(show: boolean) {
    this.showGrid = show;
    this.repaint();
  }

  /**
   * Get snap to grid
   */
  getSnapToGrid(): boolean {
    return this.snapToGrid;
  }

  /**
   * Set snap to grid
   */
  setSnapToGrid(value: boolean) {
    this.snapToGrid = value;
  }

  /**
   * Get snap to object
   */
  getSnapToObjects(): boolean {
    return this.snapToObjects;
  }

  /**
   * Set snap to object
   */
  setSnapToObjects(value: boolean) {
    this.snapToObjects = value;
  }

  /**
   * Fit the editor size to the holder element
   */
  fit() {
    const rect = this.parent.getBoundingClientRect();
    this.setSize(rect.width, rect.height);
  }

  /**
   * Get origin point in CCS
   */
  getOrigin(): number[] {
    return this.canvas.origin;
  }

  /**
   * Set origin point
   */
  setOrigin(x: number, y: number) {
    this.canvas.origin = [x, y];
    if (this.currentPage) {
      this.currentPage.pageOrigin = [x, y];
      this.repaint();
    }
    this.onScroll.emit([x, y]);
  }

  /**
   * Move origin point
   */
  moveOrigin(dx: number, dy: number) {
    this.setOrigin(this.canvas.origin[0] + dx, this.canvas.origin[1] + dy);
  }

  /**
   * Return the size of canvas element in CCS
   */
  getSize(): number[] {
    return [this.canvasElement.width, this.canvasElement.height];
  }

  /**
   * Set canvas element size
   */
  setSize(width: number, height: number) {
    this.canvasElement.width = width;
    this.canvasElement.height = height;
    // Setup for High-DPI (Retina) Display
    this.canvasElement.width = Math.floor(width * this.canvas.ratio);
    this.canvasElement.height = Math.floor(height * this.canvas.ratio);
    this.canvasElement.style.width = width + "px";
    this.canvasElement.style.height = height + "px";
    this.repaint();
  }

  /**
   * Get screen center point in GCS
   */
  getCenter(): number[] {
    const sz = this.getSize();
    return this.canvas.globalCoordTransformRev([sz[0] / 2, sz[1] / 2]);
  }

  /**
   * Get bounding rect in GCS
   */
  getBoundingRect(): number[][] {
    const rect: number[][] = [[0, 0], this.getSize()];
    return rect.map((p) => this.canvas.globalCoordTransformRev(p));
  }

  /**
   * Get scale
   */
  getScale(): number {
    return this.canvas.scale;
  }

  /**
   * Set scale
   */
  setScale(scale: number) {
    if (scale < 0.15) {
      // min 15%
      scale = 0.15;
    }
    if (scale > 3) {
      // max 300%
      scale = 3;
    }
    this.canvas.scale = scale;
    if (this.currentPage) {
      this.currentPage.pageScale = scale;
      this.repaint();
    }
    this.onZoom.emit(scale);
  }

  /**
   * Set zoom scale while keeping the screen center
   */
  zoom(scale: number = 1) {
    const center = this.getCenter();
    this.setScale(scale);
    this.scrollCenterTo(center);
    this.repaint();
  }

  /**
   * Fit doc to screen and move to center
   */
  fitToScreen(scaleAdjust: number = 1, maxScale: number = 1) {
    if (this.currentPage) {
      // doc size in GCS
      const page = this.currentPage;
      const box = Array.isArray(page.size)
        ? [[0, 0], page.size]
        : page.getViewport(this.canvas);
      const center = geometry.center(box);
      const dw = geometry.width(box);
      const dh = geometry.height(box);
      // screen size in GCS when scale = 1
      const size = this.getSize();
      const sw = Math.round(size[0] / this.canvas.ratio);
      const sh = Math.round(size[1] / this.canvas.ratio);
      const scale = Math.min(sw / dw, sh / dh, maxScale);
      this.setScale(scale * scaleAdjust);
      this.scrollCenterTo(center);
    }
  }

  /**
   * Scroll screen
   */
  scroll(dx: number, dy: number) {
    this.moveOrigin(dx, dy);
  }

  /**
   * Scroll screen center to a point in GCS
   * @param center center point in GCS. If not provided, scroll to the center
   *   of the page size or the center of the shapes
   */
  scrollCenterTo(center?: number[]) {
    if (this.currentPage) {
      // doc size in GCS
      const page = this.currentPage;
      const box = Array.isArray(page.size)
        ? [[0, 0], page.size]
        : page.getViewport(this.canvas);
      if (!center) {
        center = geometry.center(box);
      }
      // screen size in CGS when scale = 1
      const size = this.getSize();
      const sw = Math.round(size[0] / this.canvas.ratio);
      const sh = Math.round(size[1] / this.canvas.ratio);
      // screen size in CGS with zoom scale
      const zsw = sw / this.canvas.scale;
      const zsh = sh / this.canvas.scale;
      const px = Math.round(center[0] - zsw / 2);
      const py = Math.round(center[1] - zsh / 2);
      this.setOrigin(-px, -py);
    }
  }

  /**
   * Scroll to center of the shapes
   */
  scrollToCenter() {
    if (this.currentPage) {
      const page = this.currentPage;
      const box = Array.isArray(page.size)
        ? [[0, 0], page.size]
        : page.getViewport(this.canvas);
      const center = geometry.center(box);
      this.scrollCenterTo(center);
    }
  }

  /**
   * Get the active handler
   */
  getActiveHandler(): Handler | null {
    return this.activeHandler;
  }

  /**
   * Activate a handler by id
   */
  activateHandler(id: string) {
    const handler = this.handlers[id];
    if (this.activeHandler !== handler) {
      if (this.activeHandler) {
        this.activeHandler.deactivate(this);
      }
      if (handler) {
        this.activeHandler = handler;
        this.activeHandler.activate(this);
        this.onActiveHandlerChange.emit(handler.id);
      }
    }
  }

  /**
   * Activate the default handler
   */
  activateDefaultHandler() {
    if (this.options.defaultHandlerId) {
      this.activateHandler(this.options.defaultHandlerId);
    }
  }

  /**
   * Set active handler lock
   */
  setActiveHandlerLock(lock: boolean) {
    if (this.activeHandlerLock !== lock) {
      this.activeHandlerLock = lock;
      this.onActiveHandlerLockChange.emit(lock);
    }
  }

  /**
   * Get active handler lock
   */
  getActiveHandlerLock(): boolean {
    return this.activeHandlerLock;
  }

  /**
   * Clear background
   */
  private clearBackground(canvas: Canvas) {
    const g = canvas.context;
    const pageSize = this.currentPage?.size;
    g.fillStyle = this.canvas.resolveColor(
      pageSize
        ? (this.options.blankColor ?? Color.BLANK)
        : (this.options.canvasColor ?? Color.CANVAS)
    );
    g.globalAlpha = 1;
    g.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  }

  /**
   * Draw the page boundary and grid
   */
  private drawPageAndGrid(canvas: Canvas) {
    const scale = this.getScale();
    const pageSize = this.currentPage?.size;

    canvas.save();
    canvas.globalTransform();

    // draw canvas background
    if (pageSize) {
      canvas.roughness = 0;
      canvas.alpha = 1;
      canvas.fillStyle = FillStyle.SOLID;
      canvas.fillColor = this.canvas.resolveColor(
        this.options.canvasColor ?? Color.CANVAS
      );
      canvas.fillRect(0, 0, pageSize[0], pageSize[1]);
    }

    // draw grid
    if (this.showGrid) {
      const sz = this.getSize();
      const p1 = canvas.globalCoordTransformRev([0, 0]);
      const p2 = canvas.globalCoordTransformRev(sz);
      let w = this.gridSize[0] * 2;
      let h = this.gridSize[1] * 2;
      const dotSize = Math.max(Math.round(2 / scale), 2);
      if (scale < 0.2) {
        w = this.gridSize[0] * 16;
        h = this.gridSize[1] * 16;
      } else if (scale < 0.4) {
        w = this.gridSize[0] * 8;
        h = this.gridSize[1] * 8;
      } else if (scale < 0.8) {
        w = this.gridSize[0] * 4;
        h = this.gridSize[1] * 4;
      }
      const wc = Math.floor((p2[0] - p1[0]) / w);
      const wh = Math.floor((p2[1] - p1[1]) / h);

      // Set up the canvas state for dots
      canvas.roughness = 0;
      // Calculate opacity based on zoom level
      const minOpacity = 0.1; // minimum opacity
      const maxOpacity = 0.8; // maximum opacity
      const opacityScale = Math.min(Math.max((scale - 0.1) / 0.4, 0), 1); // scale from 0.1 to 0.5 zoom
      canvas.alpha = minOpacity + (maxOpacity - minOpacity) * opacityScale;
      canvas.fillColor = this.canvas.resolveColor(
        this.options.gridColor ?? Color.GRID
      );
      canvas.fillStyle = FillStyle.SOLID;

      // Only draw dots if they would be visible
      if (canvas.alpha > minOpacity) {
        // Draw dots at grid intersections
        for (let i = 0; i <= wc; i++) {
          const x = p1[0] + i * w - (p1[0] % w);
          for (let j = 0; j <= wh; j++) {
            const y = p1[1] + j * h - (p1[1] % h);
            canvas.fillEllipse(
              x - dotSize / 2,
              y - dotSize / 2,
              x + dotSize / 2,
              y + dotSize / 2
            );
          }
        }
      }
    }

    // draw document border
    if (pageSize) {
      canvas.strokeColor = this.canvas.resolveColor(Color.BORDER);
      canvas.strokeWidth = 1 / scale;
      canvas.strokePattern = [];
      canvas.roughness = 0;
      canvas.alpha = 1;
      canvas.strokeRect(0, 0, pageSize[0], pageSize[1]);
    }

    canvas.restore();
  }

  /**
   * Draw selection
   */
  drawSelection() {
    if (this.activeHandler) {
      this.activeHandler.drawSelection(this);
    }
  }

  /**
   * Update all shapes
   */
  update() {
    if (this.store.root) {
      this.store.root.children.forEach((obj) => {
        if (obj instanceof Shape) obj.update(this.canvas);
      });
    }
  }

  /**
   * Repaint diagram
   */
  repaint(drawSelection: boolean = true) {
    // console.time("repaint");
    this.clearBackground(this.canvas);
    if (this.currentPage) {
      this.drawPageAndGrid(this.canvas);
      this.currentPage.draw(this.canvas, this.options.showDOM);
      if (drawSelection) this.drawSelection();
      this.onRepaint.emit();
    }
    // console.timeEnd("repaint");
  }

  /**
   * Get cursor
   */
  getCursor() {
    return this.canvasElement.style.cursor;
  }

  /**
   * Set cursor
   */
  setCursor(cursor: string, angle: number = 0) {
    const cssCursor = cursor.replace("{{angle}}", angle.toString());
    this.canvasElement.style.cursor = cssCursor;
  }

  /**
   * Get the document
   */
  getDoc(): Doc {
    return this.store.root as Doc;
  }

  /**
   * Set the document
   */
  setDoc(doc: Doc) {
    this.store.setRoot(doc);
  }

  /**
   * Create a new document
   */
  newDoc(): Doc {
    const doc = new Doc();
    const page = new Page();
    page.name = "Page 1";
    doc.children.push(page);
    page.parent = doc;
    this.store.setRoot(doc);
    this.setCurrentPage(doc.children[0] as Page);
    return doc;
  }

  /**
   * Load from JSON
   */
  loadFromJSON(json: any) {
    if (json) {
      this.selection.deselectAll();
      this.store.fromJSON(json);
      if (
        this.store.root instanceof Doc &&
        this.store.root.children.length > 0 &&
        this.store.root.children[0] instanceof Page
      ) {
        this.setCurrentPage(this.store.root.children[0] as Page);
      }
    }
  }

  /**
   * Save to JSON
   */
  saveToJSON(): any {
    return this.store.toJSON();
  }
}

/**
 * Manipulator Manager
 */
class ManipulatorManager {
  static instance: ManipulatorManager;

  manipulators: Record<string, Manipulator>;

  constructor() {
    this.manipulators = {};
  }

  /**
   * Define a manipulator
   * @param type shape type
   * @param manipulator a manipulator instance for the shape type
   */
  define(type: string, manipulator: Manipulator) {
    assert(
      !this.manipulators[type],
      `A manipulator of '${type}' already defined.`
    );
    this.manipulators[type] = manipulator;
  }

  /**
   * Get a manupulator by shape type
   */
  get(type: string): Manipulator | null {
    const manipulator = this.manipulators[type];
    return manipulator ?? null;
  }

  /**
   * Returns all types
   */
  getTypes(): string[] {
    return Object.keys(this.manipulators);
  }

  /**
   * Returns a singleton manipulator manager
   */
  static getInstance(): ManipulatorManager {
    if (!ManipulatorManager.instance) {
      ManipulatorManager.instance = new ManipulatorManager();
    }
    return ManipulatorManager.instance;
  }
}

export interface HandlerOptions {
  defaultLock: boolean;
}

/**
 * Handler
 */
export class Handler {
  id: string;
  options: HandlerOptions;
  dragging: boolean;
  dragStartPoint: number[];
  dragPoint: number[];

  constructor(id: string, options?: Partial<HandlerOptions>) {
    this.id = id;
    this.options = {
      defaultLock: false,
      ...options,
    };
    this.dragging = false;
    this.dragStartPoint = [-1, -1];
    this.dragPoint = [-1, -1];
    this.reset();
  }

  /**
   * Reset the states of handler
   */
  reset() {
    this.dragging = false;
    this.dragStartPoint = [-1, -1];
    this.dragPoint = [-1, -1];
  }

  /**
   * Trigger when the handler action is complete
   */
  complete(editor: Editor) {
    if (!editor.getActiveHandlerLock()) {
      editor.activateDefaultHandler();
    }
  }

  /**
   * Activate the handler
   */
  activate(editor: Editor) {
    editor.setActiveHandlerLock(this.options.defaultLock);
    this.onActivate(editor);
  }

  /**
   * Deactivate the handler
   */
  deactivate(editor: Editor) {
    this.onDeactivate(editor);
  }

  /**
   * Triggered when activated
   */
  onActivate(editor: Editor) {}

  /**
   * Triggered when deactivate
   */
  onDeactivate(editor: Editor) {}

  /**
   * Triggered when action is performed (unclude undo and redo)
   */
  onActionPerformed(editor: Editor) {}

  /**
   * Initialize handler
   */
  initialize(editor: Editor, e: CanvasPointerEvent): void {}

  /**
   * Update handler
   */
  update(editor: Editor, e: CanvasPointerEvent): void {}

  /**
   * Update handler when hovering (not dragging)
   */
  updateHovering(editor: Editor, e: CanvasPointerEvent): void {}

  /**
   * Finalize handler
   */
  finalize(editor: Editor, e: CanvasPointerEvent): void {}

  /**
   * pointerDown
   */
  pointerDown(editor: Editor, e: CanvasPointerEvent) {
    if (e.button === Mouse.BUTTON1) {
      const canvas = editor.canvas;
      this.dragging = true;
      this.dragStartPoint = canvas.globalCoordTransformRev([e.x, e.y]);
      this.dragPoint = geometry.copy(this.dragStartPoint);
      this.initialize(editor, e);
      editor.repaint();
      this.drawDragging(editor, e);
    }
  }

  /**
   * pointerUp
   * @abstract
   */
  pointerUp(editor: Editor, e: CanvasPointerEvent) {
    if (e.button === Mouse.BUTTON1 && this.dragging) {
      this.finalize(editor, e);
      editor.repaint();
      this.reset();
      this.complete(editor);
    }
  }

  /**
   * pointerMove
   * @abstract
   */
  pointerMove(editor: Editor, e: CanvasPointerEvent) {
    const canvas = editor.canvas;
    if (this.dragging) {
      this.dragPoint = canvas.globalCoordTransformRev([e.x, e.y]);
      this.update(editor, e);
      editor.repaint();
      this.drawDragging(editor, e);
    } else {
      this.updateHovering(editor, e);
      editor.repaint();
      this.drawHovering(editor, e);
    }
  }

  /**
   * keyDown
   */
  keyDown(editor: Editor, e: KeyboardEvent) {
    if (e.key === "Escape" && this.dragging) {
      editor.transform.cancelAction();
      editor.repaint();
      this.reset();
      this.complete(editor);
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
  drawSelection(editor: Editor) {}

  /**
   * Draw hovering
   */
  drawHovering(editor: Editor, e: CanvasPointerEvent) {}

  /**
   * Draw dragging
   */
  drawDragging(editor: Editor, e: CanvasPointerEvent) {}
}

/**
 * Controller
 */
export class Controller {
  manipulator: Manipulator;

  /**
   * Indicates whether this controller has handles or not
   */
  hasHandle: boolean = false;

  /**
   * Indicates whether this controller is dragging or not
   */
  dragging: boolean = false;

  /**
   * Drag start point in shape's LCS
   */
  dragStartPoint: number[] = [-1, -1];

  /**
   * Drag start point in shape's GCS
   */
  dragStartPointGCS: number[] = [-1, -1];

  /**
   * Drag start point in shape's CCS
   */
  dragStartPointCCS: number[] = [-1, -1];

  /**
   * Previous drag point in shape's LCS
   */
  dragPrevPoint: number[] = [-1, -1];

  /**
   * Previous drag point in shape's GCS
   */
  dragPrevPointGCS: number[] = [-1, -1];

  /**
   * Previous drag point in shape's CCS
   */
  dragPrevPointCCS: number[] = [-1, -1];

  /**
   * Current drag point in shape's LCS
   */
  dragPoint: number[] = [-1, -1];

  /**
   * Current drag point in shape's GCS
   */
  dragPointGCS: number[] = [-1, -1];

  /**
   * Current drag point in shape's CCS
   */
  dragPointCCS: number[] = [-1, -1];

  /**
   * X-distance from dragStartPoint to dragPoint in shape's LCS
   */
  dx: number = 0;

  /**
   * Y-distance from dragStartPoint to dragPoint in shape's LCS
   */
  dy: number = 0;

  /**
   * X-distance from dragPrevPoint to dragPoint in shape's LCS
   */
  dxStep: number = 0;

  /**
   * Y-distance from dragPrevPoint to dragPoint in shape's LCS
   */
  dyStep: number = 0;

  /**
   * X-distance from dragStartPoint to dragPoint in GCS
   */
  dxGCS: number = 0;

  /**
   * Y-distance from dragStartPoint to dragPoint in GCS
   */
  dyGCS: number = 0;

  /**
   * X-distance from dragPrevPoint to dragPoint in GCS
   */
  dxStepGCS: number = 0;

  /**
   * Y-distance from dragPrevPoint to dragPoint in GCS
   */
  dyStepGCS: number = 0;

  constructor(manipulator: Manipulator) {
    this.manipulator = manipulator;
    this.reset();
  }

  reset() {
    this.dragging = false;
    this.dragStartPoint = [-1, -1];
    this.dragStartPointGCS = [-1, -1];
    this.dragStartPointCCS = [-1, -1];
    this.dragPrevPoint = [-1, -1];
    this.dragPrevPointGCS = [-1, -1];
    this.dragPrevPointCCS = [-1, -1];
    this.dragPoint = [-1, -1];
    this.dragPointGCS = [-1, -1];
    this.dragPointCCS = [-1, -1];
    this.dx = 0;
    this.dy = 0;
    this.dxStep = 0;
    this.dyStep = 0;
    this.dxGCS = 0;
    this.dyGCS = 0;
    this.dxStepGCS = 0;
    this.dyStepGCS = 0;
  }

  /**
   * Indicates the controller is active or not
   */
  active(editor: Editor, shape: Shape): boolean {
    return true;
  }

  /**
   * Returns true if mouse cursor is inside the controller.
   * Default implementation returns true if the point inside the shape.
   */
  mouseIn(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    const canvas = editor.canvas;
    const p = canvas.globalCoordTransformRev([e.x, e.y]);
    return shape.visible && shape.enable && shape.containsPoint(canvas, p);
  }

  /**
   * Returns mouse cursor for the controller
   * @returns cursor object (null is default cursor)
   */
  mouseCursor(
    editor: Editor,
    shape: Shape,
    e: CanvasPointerEvent
  ): [string, number] | null {
    return null;
  }

  /**
   * Draw controller
   */
  draw(editor: Editor, shape: Shape) {}

  /**
   * Draw on dragging
   */
  drawDragging(editor: Editor, shape: Shape, e: CanvasPointerEvent) {}

  /**
   * Draw on hovering
   */
  drawHovering(editor: Editor, shape: Shape, e: CanvasPointerEvent) {}

  /**
   * Initialize before dragging
   */
  initialize(editor: Editor, shape: Shape, e: CanvasPointerEvent) {}

  /**
   * Update ghost
   */
  update(editor: Editor, shape: Shape, e: CanvasPointerEvent) {}

  /**
   * Finalize shape by ghost
   */
  finalize(editor: Editor, shape: Shape, e: CanvasPointerEvent) {}

  /**
   * Handle pointer down event
   * @returns handled or not
   */
  pointerDown(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    const canvas = editor.canvas;
    let handled = false;
    if (e.button === Mouse.BUTTON1 && this.mouseIn(editor, shape, e)) {
      this.reset();
      this.dragging = true;
      this.dragStartPoint = utils.ccs2lcs(canvas, shape, [e.x, e.y]);
      this.dragPrevPoint = geometry.copy(this.dragStartPoint);
      this.dragPoint = geometry.copy(this.dragStartPoint);
      this.dragStartPointGCS = utils.ccs2gcs(canvas, [e.x, e.y]);
      this.dragPrevPointGCS = geometry.copy(this.dragStartPointGCS);
      this.dragPointGCS = geometry.copy(this.dragStartPointGCS);
      this.dragStartPointCCS = [e.x, e.y];
      this.dragPrevPointCCS = geometry.copy(this.dragStartPointCCS);
      this.dragPointCCS = geometry.copy(this.dragStartPointCCS);
      handled = true;
      this.initialize(editor, shape, e);
      this.update(editor, shape, e);
      editor.repaint();
      this.drawDragging(editor, shape, e);
      editor.onDragStart.emit({
        controller: this,
        dragPoint: this.dragStartPoint,
      });
    }
    return handled;
  }

  /**
   * Handle pointer move event
   * @returns handled or not
   */
  pointerMove(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    const canvas = editor.canvas;
    let handled = false;
    if (this.dragging) {
      this.dragPrevPoint = geometry.copy(this.dragPoint);
      this.dragPrevPointGCS = geometry.copy(this.dragPointGCS);
      this.dragPrevPointCCS = geometry.copy(this.dragPointCCS);
      this.dragPoint = utils.ccs2lcs(canvas, shape, [e.x, e.y]);
      this.dragPointGCS = utils.ccs2gcs(canvas, [e.x, e.y]);
      this.dragPointCCS = [e.x, e.y];
      this.dx = this.dragPoint[0] - this.dragStartPoint[0];
      this.dy = this.dragPoint[1] - this.dragStartPoint[1];
      this.dxStep = this.dragPoint[0] - this.dragPrevPoint[0];
      this.dyStep = this.dragPoint[1] - this.dragPrevPoint[1];
      this.dxGCS = this.dragPointGCS[0] - this.dragStartPointGCS[0];
      this.dyGCS = this.dragPointGCS[1] - this.dragStartPointGCS[1];
      this.dxStepGCS = this.dragPointGCS[0] - this.dragPrevPointGCS[0];
      this.dyStepGCS = this.dragPointGCS[1] - this.dragPrevPointGCS[1];
      handled = true;
      this.update(editor, shape, e);
      editor.repaint();
      this.drawDragging(editor, shape, e);
      editor.onDrag.emit({
        controller: this,
        dragPoint: this.dragPoint,
      });
    }
    return handled;
  }

  /**
   * Handle pointer up event
   * @returns handled or not
   */
  pointerUp(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    let handled = false;
    if (e.button === Mouse.BUTTON1 && this.dragging) {
      this.finalize(editor, shape, e);
      this.reset();
      handled = true;
      editor.repaint();
      editor.onDragEnd.emit({
        controller: this,
        dragPoint: this.dragPoint,
      });
    }
    return handled;
  }

  /**
   * Handle keydown event
   * @returns handled or not
   */
  keyDown(editor: Editor, shape: Shape, e: KeyboardEvent): boolean {
    if (this.dragging && e.key === "Escape") {
      this.reset();
      editor.transform.cancelAction();
      editor.repaint();
      return true;
    }
    return false;
  }

  /**
   * Handle keyup event
   * @returns handled or not
   */
  keyUp(editor: Editor, shape: Shape, e: KeyboardEvent): boolean {
    return false;
  }
}

/**
 * Manipulator
 */
export class Manipulator {
  /**
   * Controllers of the manipulator
   */
  controllers: Controller[];

  /**
   * Dragging controller
   */
  draggingController: Controller | null;

  constructor() {
    this.controllers = [];
    this.draggingController = null;
  }

  /**
   * Returns one of controllers is dragging or not
   */
  isDragging(): boolean {
    return this.controllers.some((cp) => cp.dragging);
  }

  /**
   * Returns true if mouse cursor is inside the shape or control points
   */
  mouseIn(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    return this.controllers.some(
      (cp) => cp.active(editor, shape) && cp.mouseIn(editor, shape, e)
    );
  }

  /**
   * Returns true if mouse cursor is inside the controller's handles
   */
  mouseInHandles(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    return this.controllers.some(
      (cp) =>
        cp.hasHandle && cp.active(editor, shape) && cp.mouseIn(editor, shape, e)
    );
  }

  /**
   * Returns mouse cursor for the manipulator
   * @returns cursor object
   */
  mouseCursor(
    editor: Editor,
    shape: Shape,
    e: CanvasPointerEvent
  ): [string, number] | null {
    // dragging controller has higher priority
    for (const c of this.controllers) {
      if (c.dragging) return c.mouseCursor(editor, shape, e);
    }
    for (const c of this.controllers) {
      if (c.active(editor, shape) && c.mouseIn(editor, shape, e))
        return c.mouseCursor(editor, shape, e);
    }
    return null;
  }

  /**
   * Handle pointer down event
   * @returns handled or not
   */
  pointerDown(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    let handled = false;
    for (const cp of this.controllers) {
      if (cp.active(editor, shape) && cp.mouseIn(editor, shape, e)) {
        handled = cp.pointerDown(editor, shape, e);
        if (handled) {
          this.draggingController = cp;
          break;
        }
      }
    }
    return handled;
  }

  /**
   * Handle pointer move event
   * @returns handled or not
   */
  pointerMove(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    if (this.mouseIn(editor, shape, e) && !editor.selection.isSelected(shape)) {
      this.drawHovering(editor, shape, e);
    }
    let handled = false;
    if (this.draggingController) {
      handled = this.draggingController.pointerMove(editor, shape, e);
    }
    return handled;
  }

  /**
   * Handle pointer up event
   * @returns handled or not
   */
  pointerUp(editor: Editor, shape: Shape, e: CanvasPointerEvent): boolean {
    let handled = false;
    if (this.draggingController) {
      handled = this.draggingController.pointerUp(editor, shape, e);
    }
    this.draggingController = null;
    return handled;
  }

  /**
   * Handle keydown event
   * @returns handled or not
   */
  keyDown(editor: Editor, shape: Shape, e: KeyboardEvent): boolean {
    for (let i = 0; i < this.controllers.length; i++) {
      const cp = this.controllers[i];
      if (cp.active(editor, shape)) {
        const handled = cp.keyDown(editor, shape, e);
        if (handled) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Handle keyup event
   * @returns handled or not
   */
  keyUp(editor: Editor, shape: Shape, e: KeyboardEvent): boolean {
    for (let i = 0; i < this.controllers.length; i++) {
      const cp = this.controllers[i];
      if (cp.active(editor, shape)) {
        const handled = cp.keyUp(editor, shape, e);
        if (handled) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Draw controllers
   */
  draw(editor: Editor, shape: Shape) {
    if (!this.draggingController) {
      for (let i = this.controllers.length - 1; i >= 0; i--) {
        const cp = this.controllers[i];
        cp.active(editor, shape) && cp.draw(editor, shape);
      }
    }
  }

  /**
   * Draw hovering for the shape
   */
  drawHovering(editor: Editor, shape: Shape, e: CanvasPointerEvent) {
    const canvas = editor.canvas;
    const outline = shape.getOutline();
    const outlineCCS = outline.map((p) => utils.lcs2ccs(canvas, shape, p));
    canvas.storeState();
    canvas.strokeColor = Color.SELECTION;
    canvas.strokeWidth = canvas.px * 1.5;
    canvas.strokePattern = [];
    canvas.roughness = 0;
    canvas.alpha = 1;
    canvas.polyline(outlineCCS);
    canvas.restoreState();
    this.controllers.forEach(
      (cp) => cp.active(editor, shape) && cp.drawHovering(editor, shape, e)
    );
  }
}

/**
 * Plugin
 */
export abstract class Plugin {
  id: string;

  constructor(pluginId: string) {
    this.id = pluginId;
  }

  abstract activate(editor: Editor): void;
  abstract deactivate(editor: Editor): void;
}

export const manipulatorManager = ManipulatorManager.getInstance();
