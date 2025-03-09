import type { Editor } from "./editor";
import { SHAPE_MIN_SIZE } from "./graphics/const";
import * as geometry from "./graphics/geometry";
import { FillStyle } from "./graphics/graphics";
import { VGElement } from "./graphics/vector-graphic";
import {
  Connector,
  Ellipse,
  Embed,
  Frame,
  Freehand,
  Highlighter,
  HorzAlign,
  Icon,
  Image,
  Line,
  LineType,
  Mirror,
  Rectangle,
  Shape,
  Sizable,
  Text,
  VertAlign,
} from "./shapes";
import { TypedEvent } from "./std/typed-event";
import { resizeImage } from "./utils/image-utils";
import { convertStringToTextNode } from "./utils/text-utils";

/**
 * Shape factory
 */
export class ShapeFactory {
  /**
   * Editor instance
   * @private
   */
  editor: Editor;

  /**
   * Event emitter for shape creation
   */
  onCreate: TypedEvent<Shape>;

  /**
   * Event emitter for shape initialization
   */
  onShapeInitialize: TypedEvent<Shape>;

  constructor(editor: Editor) {
    this.editor = editor;
    this.onCreate = new TypedEvent();
    this.onShapeInitialize = new TypedEvent();
  }

  // TODO: Consider to move to editor.on("create", shape)
  /**
   * Trigger create event
   * @private
   */
  triggerCreate(shape: Shape) {
    this.onCreate.emit(shape);
  }

  /**
   * Create a rectangle
   */
  createRectangle(rect: number[][]): Rectangle {
    const rectangle = new Rectangle();
    rectangle.left = rect[0][0];
    rectangle.top = rect[0][1];
    const w = geometry.width(rect);
    const h = geometry.height(rect);
    rectangle.width = w;
    rectangle.height = h;
    rectangle.horzAlign = HorzAlign.CENTER;
    rectangle.vertAlign = VertAlign.MIDDLE;
    this.onShapeInitialize.emit(rectangle);
    return rectangle;
  }

  /**
   * Create an ellipse
   */
  createEllipse(rect: number[][]): Ellipse {
    const ellipse = new Ellipse();
    ellipse.left = rect[0][0];
    ellipse.top = rect[0][1];
    const w = geometry.width(rect);
    const h = geometry.height(rect);
    ellipse.width = w;
    ellipse.height = h;
    ellipse.horzAlign = HorzAlign.CENTER;
    ellipse.vertAlign = VertAlign.MIDDLE;
    this.onShapeInitialize.emit(ellipse);
    return ellipse;
  }

  /**
   * Create a text
   */
  createText(rect: number[][], initialText: string = ""): Text {
    const text = new Text();
    text.text = convertStringToTextNode(initialText, text.horzAlign);
    text.strokeColor = "$foreground";
    text.fillColor = "$background";
    text.fillStyle = FillStyle.NONE;
    text.left = rect[0][0];
    text.top = rect[0][1];

    let w = geometry.width(rect);
    const h = geometry.height(rect);

    // If the text is long and the width is minimal, set a reasonable default width
    // This prevents text from extending too far horizontally
    const isLongText = initialText.length > 50;
    const isMinimalWidth = w < 10; // When rect is just a point (e.g., [center, center])

    if (isLongText && isMinimalWidth) {
      const defaultWidth = 500; // Default width for long text
      w = defaultWidth;
      text.wordWrap = true;
      text.sizable = "free"; // Allow user to resize in any direction

      // Only constrain the height to adjust based on content
      // This allows the width to be freely changed by the user
      text.constraints = [
        {
          id: "set-size",
          width: "text-min", // Allow width to be manually resized but not smaller than text
          height: "text", // Height adjusts based on content
        },
      ];
    } else {
      text.width = w;
      text.height = h;
      text.constraints.push({
        id: "set-size",
        width: "text",
        height: "text",
      });
    }

    text.horzAlign = HorzAlign.LEFT;
    text.vertAlign = VertAlign.TOP;

    this.onShapeInitialize.emit(text);
    return text;
  }

  /**
   * Create an anchored text
   */
  createAnchoredText(anchorPosition: number, initialText: string = ""): Text {
    const text = new Text();
    text.text = convertStringToTextNode(initialText, text.horzAlign);
    text.strokeColor = "$foreground";
    text.fillColor = "$background";
    text.fillStyle = FillStyle.SOLID;
    text.horzAlign = HorzAlign.LEFT;
    text.vertAlign = VertAlign.TOP;
    text.anchored = true;
    text.anchorPosition = anchorPosition;
    text.constraints.push({ id: "anchor-on-parent" });
    text.constraints.push({
      id: "set-size",
      width: "text",
      height: "text",
    });
    this.onShapeInitialize.emit(text);
    return text;
  }

  /**
   * Create an image
   */
  async createImage(
    fileOrBlob: File | Blob,
    position: number[]
  ): Promise<Image> {
    const imageElement = await resizeImage(
      fileOrBlob,
      this.editor.options.imageResize
    );
    const image = new Image();
    const w = imageElement.width;
    const h = imageElement.height;
    image.imageData = imageElement.src;
    image.imageWidth = w;
    image.imageHeight = h;
    image.width = w;
    image.height = h;
    image.left = position[0] - w / 2;
    image.top = position[1] - h / 2;
    image.sizable = Sizable.RATIO;
    image.textEditable = false;
    this.onShapeInitialize.emit(image);
    return image;
  }

  /**
   * create a line (or polygon)
   */
  createLine(points: number[][], closed: boolean = false): Line {
    const line = new Line();
    const path = structuredClone(points);
    if (closed) {
      path[path.length - 1] = geometry.copy(path[0]);
    }
    line.path = path;
    const rect = geometry.boundingRect(line.path);
    line.left = rect[0][0];
    line.top = rect[0][1];
    line.width = geometry.width(rect);
    line.height = geometry.height(rect);
    this.onShapeInitialize.emit(line);
    return line;
  }

  /**
   * Create a connector
   */
  createConnector(
    tail: Shape | null,
    tailAnchor: number[],
    head: Shape | null,
    headAnchor: number[],
    points: number[][]
  ): Connector {
    const connector = new Connector();
    connector.lineType = LineType.CURVE;
    connector.constraints = [{ id: "adjust-route" }];
    connector.tail = tail;
    connector.tailAnchor = tailAnchor;
    connector.head = head;
    connector.headAnchor = headAnchor;
    connector.path = structuredClone(points);
    const rect = geometry.boundingRect(connector.path);
    connector.left = rect[0][0];
    connector.top = rect[0][1];
    connector.width = geometry.width(rect);
    connector.height = geometry.height(rect);
    this.onShapeInitialize.emit(connector);
    return connector;
  }

  /**
   * Create a freehand lines
   */
  createFreehand(points: number[][], closed: boolean = false): Freehand {
    const freehand = new Freehand();
    const path = structuredClone(points);
    if (closed) {
      path[path.length - 1] = geometry.copy(path[0]);
    }
    freehand.strokeWidth = 8;
    freehand.path = path;
    const rect = geometry.boundingRect(freehand.path);
    freehand.left = rect[0][0];
    freehand.top = rect[0][1];
    freehand.width = geometry.width(rect);
    freehand.height = geometry.height(rect);
    freehand.pathEditable = false;
    this.onShapeInitialize.emit(freehand);
    return freehand;
  }

  /**
   * Create a freehand lines
   */
  createHighlighter(points: number[][]): Highlighter {
    const highlighter = new Highlighter();
    const path = structuredClone(points);
    if (closed) {
      path[path.length - 1] = geometry.copy(path[0]);
    }
    highlighter.strokeWidth = 28;
    highlighter.strokeColor = "#FFE629";
    highlighter.opacity = 0.5;
    highlighter.pathEditable = false;
    highlighter.path = path;
    const rect = geometry.boundingRect(highlighter.path);
    highlighter.left = rect[0][0];
    highlighter.top = rect[0][1];
    highlighter.width = geometry.width(rect);
    highlighter.height = geometry.height(rect);
    this.onShapeInitialize.emit(highlighter);
    return highlighter;
  }

  createIcon(
    rect: number[][],
    viewWidth: number,
    viewHeight: number,
    data: VGElement[]
  ): Icon {
    const vectorGraphic = new Icon();
    vectorGraphic.left = rect[0][0];
    vectorGraphic.top = rect[0][1];
    vectorGraphic.width = geometry.width(rect);
    vectorGraphic.height = geometry.height(rect);
    vectorGraphic.viewWidth = viewWidth;
    vectorGraphic.viewHeight = viewHeight;
    vectorGraphic.data = structuredClone(data);
    this.onShapeInitialize.emit(vectorGraphic);
    return vectorGraphic;
  }

  /**
   * Create a frame
   */
  createFrame(rect: number[][]): Frame {
    const frame = new Frame();
    frame.left = rect[0][0];
    frame.top = rect[0][1];
    let w = geometry.width(rect);
    let h = geometry.height(rect);
    if (geometry.distance(rect[0], rect[1]) <= SHAPE_MIN_SIZE) {
      w = 100;
      h = 100;
    }
    frame.width = w;
    frame.height = h;
    frame.horzAlign = HorzAlign.CENTER;
    frame.vertAlign = VertAlign.MIDDLE;
    frame.textEditable = false;
    this.onShapeInitialize.emit(frame);
    return frame;
  }

  /**
   * Create a mirror
   */
  createMirror(rect: number[][], subject?: Shape) {
    const mirror = new Mirror();
    mirror.left = rect[0][0];
    mirror.top = rect[0][1];
    let w = geometry.width(rect);
    let h = geometry.height(rect);
    if (geometry.distance(rect[0], rect[1]) <= SHAPE_MIN_SIZE) {
      w = 100;
      h = 100;
    }
    mirror.width = w;
    mirror.height = h;
    mirror.horzAlign = HorzAlign.CENTER;
    mirror.vertAlign = VertAlign.MIDDLE;
    mirror.textEditable = false;
    if (subject) mirror.subject = subject;
    this.onShapeInitialize.emit(mirror);
    return mirror;
  }

  /**
   * Create an embed
   */
  createEmbed(rect: number[][]): Embed {
    const embed = new Embed();
    embed.left = rect[0][0];
    embed.top = rect[0][1];
    let w = geometry.width(rect);
    let h = geometry.height(rect);
    if (geometry.distance(rect[0], rect[1]) <= SHAPE_MIN_SIZE) {
      w = 100;
      h = 100;
    }
    embed.width = w;
    embed.height = h;
    embed.horzAlign = HorzAlign.CENTER;
    embed.vertAlign = VertAlign.MIDDLE;
    embed.textEditable = false;
    this.onShapeInitialize.emit(embed);
    return embed;
  }
}
