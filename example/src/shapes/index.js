/**
 * Example Geometry Shapes API Namespace
 * @namespace Geometry.Shapes
 * @summary
 * * A collection of JavaScript classes that implement shapes on a grid
 * * An example of an ESModule treated as a member of the API entrypoint
 * @description
 * While technically an ESModule, most packages don't allow the contents of their modules to be accessed directly.
 * In such cases, packages may still provide access to these modules via some higher-up entrypoint.
 * In Classy Template's opinion, these are more accurately described as "namespaces" and should be tagged as such.
 */
export {default as Rectangle} from "./rectangle";
export {default as Square} from "./square";