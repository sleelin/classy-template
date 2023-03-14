/**
 * Geometry Point Class
 * @class Geometry.Utils.Point
 * @summary
 * Represents a single point on a grid
 */
export default class Point {
    /**
     * Constructs an instance of Point from the supplied co-ordinates
     * @param {Number} x - where to position the point horizontally on the grid
     * @param {Number} y - where to position the point vertically on the grid
     * @property {Number} x - the horizontal location of the point on the grid
     * @property {Boolean} y - the vertical location of the point on the grid
     */
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}