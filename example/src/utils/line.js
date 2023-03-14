/**
 * Geometry Line Class
 * @class Geometry.Utils.Line
 * @summary
 * Represents a straight line drawn between two points on a grid
 * @description
 * Test
 */
export default class Line {
    /**
     * Constructs an instance of Line from the supplied point instances
     * @param {Geometry.Utils.Point} start - which point on the grid to start the line from
     * @param {Geometry.Utils.Point} finish - which point on the grid to finish the line at
     * @property {Geometry.Utils.Point} begins - the point on the grid where the line begins
     * @property {Geometry.Utils.Point} ends - the point on the grid where the line ends
     */
    constructor(start, finish) {
        this.begins = start;
        this.ends = finish;
    }
    
    /**
     * The length of the line on the graph as described by Pythagoras theorem
     * @type {Number}
     */
    get length() {
        const width = this.begins.x - this.ends.x;
        const height = this.begins.y - this.ends.y;
        
        return Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2));
    }
}