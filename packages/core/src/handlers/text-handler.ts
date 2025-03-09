import { Editor, Handler } from "../editor";
import { Cursor } from "../graphics/const";
import { CanvasPointerEvent } from "../graphics/graphics";
import { HandlerSnapper } from "../manipulators/snapper";
import { Sizable, Text } from "../shapes";

/**
 * Text Factory Handler
 */
export class TextFactoryHandler extends Handler {
  shape: Text | null = null;
  snapper: HandlerSnapper = new HandlerSnapper();

  // Define fixed dimensions for text shape - make it larger to ensure visibility
  readonly DEFAULT_WIDTH = 350; // Larger width for better visibility
  readonly DEFAULT_HEIGHT = 150; // Taller height for better visibility

  // Empty initial text - leaving it blank helps with editor focus
  readonly INITIAL_TEXT = "";

  reset(): void {
    super.reset();
    this.shape = null;
  }

  initialize(editor: Editor, e: CanvasPointerEvent): void {
    // snap drag start point
    const snapped = this.snapper.snap(editor, this.dragStartPoint);
    if (snapped) {
      const [dx, dy] = snapped;
      this.dragStartPoint = [
        this.dragStartPoint[0] + dx,
        this.dragStartPoint[1] + dy,
      ];
    }

    // Always create a reasonable sized rectangle regardless of drag
    const rect = [
      [this.dragStartPoint[0], this.dragStartPoint[1]],
      [
        this.dragStartPoint[0] + this.DEFAULT_WIDTH,
        this.dragStartPoint[1] + this.DEFAULT_HEIGHT,
      ],
    ];

    // Create the text shape
    const page = editor.getCurrentPage();
    if (page) {
      try {
        // Create text shape with empty text for better focus behavior
        this.shape = editor.factory.createText(rect, this.INITIAL_TEXT);

        if (this.shape) {
          // Apply forced styling to ensure consistent appearance
          this.applyForcedStyling(editor);

          // Insert the shape into the canvas
          editor.actions.insert(this.shape);

          // Force a repaint for visibility
          editor.repaint();

          // Select the shape for editing
          editor.selection.deselectAll();
          editor.selection.select([this.shape]);

          // Trigger immediate creation event which will open text editor
          editor.factory.triggerCreate(this.shape);

          // Complete the handler operation
          this.complete(editor);
        } else {
          this.complete(editor);
        }
      } catch (error) {
        console.error("Error creating text shape:", error);
        this.complete(editor);
      }
    }
  }

  // Apply forced styling to ensure consistent appearance
  private applyForcedStyling(editor: Editor): void {
    if (!this.shape) return;

    // Force dimensions
    this.shape.width = this.DEFAULT_WIDTH;
    this.shape.height = this.DEFAULT_HEIGHT;

    // Make the shape fully interactive
    this.shape.sizable = Sizable.FREE;

    // Remove any constraints that might affect dimensions
    this.shape.constraints = [];

    // Ensure the text is editable
    this.shape.textEditable = true;

    // Use a common, reliable font size to reduce font loading issues
    this.shape.fontSize = 16;
  }

  update(editor: Editor, e: CanvasPointerEvent): void {
    // No size updates during drag - we use fixed dimensions
    // Just update snapper for visual feedback
    const snapped = this.snapper.snap(editor, this.dragPoint);
    if (snapped) {
      const [dx, dy] = snapped;
      this.dragPoint = [this.dragPoint[0] + dx, this.dragPoint[1] + dy];
      this.snapper.guidePoints = [
        this.dragStartPoint,
        [this.dragPoint[0], this.dragStartPoint[1]],
        [this.dragStartPoint[0], this.dragPoint[1]],
        this.dragPoint,
      ];
    }
  }

  updateHovering(editor: Editor, e: CanvasPointerEvent): void {
    // snap hovering point
    const p = editor.canvas.globalCoordTransformRev([e.x, e.y]);
    this.snapper.snap(editor, p);
  }

  onActivate(editor: Editor): void {
    this.snapper.setReferences(editor, []);
    editor.setCursor(Cursor.CROSSHAIR);
  }

  onDeactivate(editor: Editor): void {
    editor.setCursor(Cursor.DEFAULT);
  }

  onActionPerformed(editor: Editor): void {
    this.snapper.setReferences(editor, []);
  }

  drawHovering(editor: Editor, e: CanvasPointerEvent) {
    this.snapper.draw(editor);
  }

  drawDragging(editor: Editor, e: CanvasPointerEvent) {
    this.snapper.draw(editor);
  }
}
