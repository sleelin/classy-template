/**
 * Interfaces to be implemented by other classes
 * @namespace Geometry.Interfaces
 * @summary
 * * Contains JavaScript classes that don't provide any proper implemented code
 * * An example of an ESModule treated as a member of the API entrypoint
 * @description
 * These are a set of JavaScript classes that should be extended by other classes.
 * They don't implement any actual functionality.
 * > **Note:**
 * > Although they don't implement functionality, there's no technical reason they couldn't,
 * > since interfaces aren't really something JavaScript implements itself,
 * > and are a concept programmers try to use in JS for abstraction and organisation. 
 */
export {default as Shape} from "./shape";