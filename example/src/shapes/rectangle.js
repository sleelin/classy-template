import {Shape} from "../interfaces";
import {Point, Line} from "../utils";

/**
 * Geometry Rectangle Shape Class
 * @class Geometry.Shapes.Rectangle
 * @implements Geometry.Interfaces.Shape
 * @summary
 * Represents a rectangle drawn on a grid
 */
export default class Rectangle extends Shape {
    /**
     * Constructs an instance of Rectangle from the supplied width, height, and origin
     * @param {Number} width - how wide the rectangle should be
     * @param {Number} height - how high the rectangle should be
     * @param {Geometry.Utils.Point} [origin=Point(0, 0)] - which point on the grid to start the rectangle from
     * @property {Number} width - the horizontal width of the rectangle
     * @property {Number} height - the vertical height of the rectangle
     */
    constructor(width, height, origin = new Point(0, 0)) {
        super();
        
        const topLeft = new Point(origin.x, origin.y);
        const topRight = new Point(origin.x + width, origin.y);
        const bottomLeft = new Point(origin.x, origin.y + height);
        const bottomRight = new Point(origin.x + width, origin.y + height);
        
        this.width = width;
        this.height = height;
        this.lines = [
            new Line(topLeft, topRight),
            new Line(topRight, bottomRight),
            new Line(bottomRight, bottomLeft),
            new Line(bottomLeft, topLeft)
        ];
    }
    
    /** Calculate the amount of space taken up by the rectangle */
    area() {
        return this.width * this.height;
    }
    
    /** Calculate the total length of all four sides of the rectangle */
    perimeter() {
        let length = 0;
        
        for (let line of this.lines) {
            length += line.length;
        }
        
        return length;
    }
}