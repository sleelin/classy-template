/**
 * ClassyTemplate Example Class
 * @class Geometry.ExampleClass
 * @summary
 * An example of a JavaScript class that is a member of the API entrypoint
 * @description
 * Documented classes can also include more verbose descriptions that are included in the documentation, as below.
 * 
 * ### Lorem Ipsum
 * Salutatus quem ultrices mentitum discere sodales perpetua audire sed torquent.
 * No recteque dicunt pri a pulvinar penatibus.
 * Litora interpretaris veritus scripserit falli duis.
 *
 * #### Moderatius Facilis Possim
 * Eam vix percipit eius mel civibus cras tellus voluptaria postea.
 * Meliore sale no adipiscing ex deserunt natoque scripserit fusce falli.
 *
 * ### Causae Error
 * Error causae dissentiunt justo fabulas conubia. Graece congue dicit harum saperet sumo adolescens eloquentiam.
 * Torquent quaeque magnis errem mandamus malesuada.
 * @example
 * <caption>An example with a caption</caption>
 * // Captions must be wrapped in <caption></caption> tags
 * new ExampleClass("example");
 * @example
 * // An example without a caption
 * new ExampleClass("example");
 */
export default class ExampleClass {
    /**
     * Constructs an instance of ExampleClass from the supplied parameters
     * @param {String} param1 - an example of a string parameter
     * @param {Object} [param2={}] - an example of an object parameter
     * @param {String} [param2.prop1] - a string property of an object parameter
     * @param {Number} [param2.prop2] - a number property of an object parameter
     * @param {Boolean} [param3=false] - an example of a boolean parameter
     * @property {String} prop1 - an example of a string property
     * @property {Boolean} prop2 - an example of a boolean property
     * @property {Geometry.ExampleClass~ExampleType} prop3 - an example of an object property
     */
    constructor(param1, param2 = {}, param3 = false) {
        this.prop1 = param1;
        this.prop2 = param3;
        
        /**
         * @typedef {Object} Geometry.ExampleClass~ExampleType
         * @property {String} str - a string property of an object property
         * @property {Number} num - a number property of an object property
         */
        this.prop3 = {
            str: param2.prop1,
            num: param2.prop2
        };
    }
    
    /**
     * An example of a static member of a class, with a default value
     * @type {String[]}
     */
    static titles = ["An Example"];
    
    /**
     * Says hello
     * @param {String} name - who to say hello to
     */
    hello(name) {
        console.log(`Hello ${name}!`)
    }
    
    /**
     * Adds two numbers together
     * @param {Number} x - first number
     * @param {Number} y - second number
     * @returns {Number} first and second number added together
     */
    static add(x, y) {
        return x+y;
    }
}

/**
 * Collection of strings documented for the example class
 * @enum
 * @inner
 * @constant
 * @type {String[]}
 * @alias ExampleStrings
 * @memberOf Geometry.ExampleClass
 */
const strings = ["and", "or", "not"];