import Rectangle from "./rectangle";

/**
 * Geometry Square Shape Class
 * @class Geometry.Shapes.Square
 * @extends Geometry.Shapes.Rectangle
 * @summary
 * Represents a square drawn on a grid
 * @description
 * This class extends the rectangle shape to draw a square on the grid
 */
export default class Square extends Rectangle {
    /**
     * Constructs an instance of Square with sides of supplied size and origin
     * @param {Number} size - how tall and wide the square's sides should be
     * @param {Geometry.Utils.Point} [origin=new Point(0, 0)] - which point on the grid to start the square from
     */
    constructor(size, origin) {
        super(size, size, origin);
    }
}