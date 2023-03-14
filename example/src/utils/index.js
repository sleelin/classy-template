/**
 * Example Geometry Utilities API Namespace
 * @namespace Geometry.Utils
 * @summary
 * * Contains classes and methods useful for locating and drawing shapes on a grid
 * * An example of an ESModule treated as a member of the API entrypoint
 * @description
 * While technically an ESModule, most packages don't allow the contents of their modules to be accessed directly.
 * In such cases, packages may still provide access to these modules via some higher-up entrypoint.
 * In Classy Template's opinion, these are more accurately described as "namespaces" and should be tagged as such.
 */
export {default as Point} from "./point";
export {default as Line} from "./line";