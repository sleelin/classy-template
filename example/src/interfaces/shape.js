/**
 * Shape Interface
 * @interface Geometry.Interfaces.Shape
 * @summary
 * * Describes a shape made up of a number of lines
 * * A JavaScript class that should be treated as an "interface"
 */
export default class Shape {
    /**
     * Constructs an instance of a shape from the supplied parameters
     * @property {Geometry.Utils.Line[]} lines - the set of lines that the shape is made from
     */
    constructor() {
        // I am an interface, so I don't do anything...
    }
    
    /**
     * Calculate the amount of space taken up by the shape
     * @returns {Number} the amount of space taken up by the shape
     * @abstract
     */
    area() {
        // Doesn't do anything...
    }
    
    /**
     * Calculate the total length of all lines of the shape
     * @returns {Number} the total length of all lines of the shape
     * @abstract
     */
    perimeter() {
        // Doesn't do anything...
    }
}

/**
 * Other Interface
 * @interface Geometry.Interfaces.Other
 * @summary
 * * Describes a second interface documented in the same file as some other symbol
 * * A JSDoc doclet that should be treated as an "interface"
 * @description
 * Lorem ipsum omnesque himenaeos vix mei periculis appareat.   
 * Purus nonumes animal percipit ac. Quot purus iriure posidonium magnis sit pertinacia similique fames.  
 * Consetetur usu explicari tibique metus. Labores mandamus venenatis malesuada posse.
 */