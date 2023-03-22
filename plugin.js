const path = require("path");
const Syntax = require("jsdoc/src/syntax").Syntax;
const nodeToValue = require("jsdoc/src/astnode").nodeToValue;

exports.defineTags = function (dictionary) {
    const tags = {
        description: dictionary.lookUp("description"),
        classdesc: dictionary.lookUp("classdesc")
    };
    
    // Set the doclet title from the first "description" found
    dictionary.defineTag("description", {
        ...tags.description,
        onTagged(doclet, tag) {
            doclet.title = doclet.title ?? doclet.description ?? tag.value;
        }
    });
    
    // Treat "classdesc" as doclet title, unless explicitly tagged
    dictionary.defineTag("classdesc", {
        ...tags.classdesc,
        onTagged(doclet, tag) {
            if (!doclet.comment.includes("@classdesc ")) {
                doclet.title = tag.value;
            } else {
                tags.classdesc.onTagged(doclet, tag);
            }
        }
    });
};

exports.handlers = {
    symbolFound(e) {
        const {node} = e.code ?? {};
        const {type, value} = node ?? {};
        
        // Class properties with default values shouldn't need to explicitly declare themselves
        if (type === Syntax.ClassProperty && !!value) e.code.value = nodeToValue(value);
    },
    parseComplete(e) {
        // Set default values when the @default tag was omitted
        for (let d of e.doclets.filter(d => !d.undocumented && d.defaultvalue === undefined && d?.meta?.code?.value)) {
            d.defaultvalue = d.meta.code.value;
            
            // Get the default value type from the underlying node
            for (let {type} of [d.meta.code.node, d.meta.code.node?.value ?? {}]) {
                if (type === Syntax.ArrayExpression) d.defaultvaluetype = "array";
                if (type === Syntax.ObjectExpression) d.defaultvaluetype = "object";
            }
        }
        
        // Go through source files to get classdesc from class or interface constructors
        for (let sourcefile of e.sourcefiles) {
            const filepath = path.dirname(sourcefile);
            const filename = path.basename(sourcefile);
            // Get doclets within this source file, then get doclets that describe a class declaration
            const doclets = e.doclets.filter(d => (d?.meta?.path === filepath && d?.meta?.filename === filename && !!d.comment));
            const classdecs = doclets.filter(d => (!d.undocumented && d.kind === "class"));
            // Get doclets that describe an interface declaration, then sort by line number
            const ifaces = doclets.filter(d => (!d.undocumented && d.kind === "interface"))
                .sort((a, b) => a?.meta?.lineno - b?.meta?.lineno);
            
            // Go through class declarations and get the constructor description
            for (let classdec of classdecs) if (!classdec.undocumented) {
                // Get some positional details for finding the next doclet that could be a constructor
                const [firstPos = Infinity, lastPos = - 1] = classdec?.meta?.range ?? [];
                const {title, meta: {lineno: firstLine}} = classdec;
                const nextIndex = classdecs.indexOf(classdec) + 1;
                const lastLine = nextIndex >= classdecs.length ? Infinity : classdecs[nextIndex]?.meta?.lineno;
                // Get the first "undocumented" or wrongly documented doclet between start and end of class declaration
                const constructor = doclets.find(({undocumented, kind, scope, meta: {lineno, range: [start, finish] = []} = {}}) => (
                    (undocumented && kind === "class" && scope === "instance" && (start > firstPos && finish < lastPos)) 
                    || (kind === "class" && scope === "static" && (lineno > firstLine && lineno <= lastLine)))) ?? {};
                const {description, classdesc, params, properties} = constructor;
                
                // If the descriptions don't match, use class constructor description as the classdesc
                if (!!description && classdec.description !== description) classdec.classdesc = description;
                // Otherwise, assume the description is meant to be the classdesc
                else {
                    classdec.classdesc = classdec.description;
                    classdec.description = "";
                }
                
                // Mark the constructor as undocumented and proceed to copy missing details
                Object.assign(constructor, {undocumented: true});
                Object.assign(classdec, {
                    description: classdec.description === `<p>${title}</p>` ? "" : classdec.description,
                    ...(classdesc ? {classdesc} : {}),
                    ...(params ? {params} : {}),
                    ...(properties ? {properties} : {})
                });
            }
            
            // Go through interface declarations and get the constructor description
            for (let iface of ifaces) {
                // Get some positional details for finding the next doclet that could be a constructor
                const {title, description, meta: {lineno: firstLine}} = iface;
                const nextIndex = ifaces.indexOf(iface) + 1;
                const lastLine = nextIndex >= ifaces.length ? Infinity : ifaces[nextIndex]?.meta?.lineno;
                // Get the first "undocumented" or wrongly documented doclet between start and end of interface declaration
                const constructor = doclets.find(({kind, scope, meta: {lineno} = {}}) =>
                    (kind === "class" && scope === "static" && (lineno >= firstLine && lineno <= lastLine))) ?? {};
                const {classdesc, params, properties} = constructor;
                
                // Mark the constructor as undocumented and proceed to copy missing details
                Object.assign(constructor, {undocumented: true});
                Object.assign(iface, {
                    description: description === `<p>${title}</p>` ? "" : description,
                    ...(classdesc ? {classdesc, virtual: true} : {}),
                    ...(params ? {params} : {}),
                    ...(properties ? {properties} : {})
                });
            }
        }
    }
};

/* ************************************************************* *
 *  For a package whose purpose is documentation of code,        *
 *  JSDoc 3.x is disappointingly lacking in code documentation.  *
 *  As a workaround, the following attempts to fix that...       *
 * ************************************************************* */

/**
 * Package data, parsed and collated from package.json
 * @typedef {Object.<string, any>} PackageData
 * @property {String} version - package version from package.json
 * @property {String} author - package author from package.json
 * @property {String|PackageRepositoryData} repository - location or details of the repository on a hosted git provider
 */

/**
 * @typedef {JSDocDoclet} ClassyDoclet
 * @property {String} [title] - the first line of the doclet, where the doclet is classlike, or includes multiple description tags
 */

/**
 * @typedef {Doclet} JSDocDoclet
 * @property {String} [comment] - the original text of the comment from the source code
 * @property {DocletMeta} [meta] - information about the source code associated with this doclet
 * @property {String} [kind] - the kind of symbol being documented by this doclet - see [the @kind tag]{@link https://jsdoc.app/tags-kind.html}
 * @property {String} [scope] - the scope of the symbol (e.g. static, instance, global, etc.) being document by this doclet
 * @property {String} [id] - an identifier for the relation between this doclet and its parent doclet
 * @property {String} [link] - the name of the generated page containing this doclet, and any anchor location within the page
 * @property {String} [name] - the name given to the doclet's symbol, either explicitly, or implied by the source code
 * @property {String} [alias] - the alternative name given to the doclet's symbol
 * @property {DocletTypeNames} [type] - an object containing the set of identifiers for the associated type of this doclet
 * @property {String} [since] - the package version that this symbol was first introduced in
 * @property {String} [summary] - a brief overview of this doclet
 * @property {String} [description] - the text describing the doclet, either tagged explicitly, or inferred from any text preceding a doclet tag
 * @property {String} [classdesc] - the text describing the constructor of a class
 * @property {String} [longname] - the fully resolved symbol name
 * @property {String} [memberof] - the longname of the symbol that contains this one, if any
 * @property {String} [attribs] - the attributes (e.g. nullable, static, abstract, etc.) that apply to this doclet, if any
 * @property {String} [signature] - the means of using a given method or class
 * @property {DocletParameters[]} [params] - a list of parameters associated with the usage of this doclet, if any
 * @property {DocletProperties[]} [properties] - a list of properties this doclet contains, if any
 * @property {Boolean} [async] - whether the symbol being documented is asynchronous
 * @property {Boolean} [virtual] - whether the symbol being documented is for an abstract member
 * @property {Boolean} [isEnum] - whether the symbol documents an enum
 * @property {String[]} [mixes] - a list of symbols that are mixed into this one, if any
 * @property {String[]} [augments] - a list of symbols that are augmented by this one, if any
 * @property {String[]} [implements] - a list of symbols that are inherited by this one, if any
 * @property {String[]} [see] - a list of symbols that should be referenced by this one, if any
 * @property {DocletReturns[]} [returns] - a list of possible return values for this doclet, if any
 * @property {DocletExceptions[]} [exceptions] - a list of possible exceptions thrown by this doclet, if any
 * @property {DocletExamples[]} [examples] - a list of examples for this doclet, if any
 */

/**
 * @typedef {Object} DocletMeta
 * @property {String} [filename] - the name of the file containing the code associated with this doclet
 * @property {Number} [lineno] - the line number of the code associated with this doclet
 * @property {Number} [columnno] - the column number of the code associated with this doclet
 * @property {String} [path] - the directory containing the source code file containing this doclet
 * @property {DocletMetaCode} [code] - information about the code symbol
 * @property {String} [source] - the full path to the source code file containing this doclet
 * @property {String} [shortpath] - the path from the base directory to the source code file containing this doclet
 * @property {Number[]} [range] - the positions of the first and last characters of the code associated with this doclet
 * @property {Object.<string, string|null>} [vars] - details identifying useful contextual information about the symbol in the source code
 */

/**
 * @typedef {Object} DocletMetaCode
 * @property {String} [id] - the unique identifier of the symbol in the source code
 * @property {String} [name] - the name of the symbol in the source code
 * @property {String} [type] - the type of the symbol in the source code
 * @property {String[]} [paramnames] - the names of any parameters associated with the symbol in the source code
 * @property {String} [value] - the value of the symbol in the source code
 */

/**
 * @typedef {Object} DocletTypeNames
 * @property {String[]} names - a list of identifiers for the associated type
 */

/**
 * @typedef {Object} DocletProperties
 * @property {String} [name] - the name given to the property, either explicitly, or implied by the source code
 * @property {DocletTypeNames} [type] - a list of types identifying the given property
 * @property {String} [description] - the text describing the property
 * @property {Boolean} [optional] - whether the property has been marked as required or optional
 * @property {String} [defaultvalue] - the default value of the given property
 * @property {DocletProperties[]} [subitems] - a list of items describing child properties for the given property
 */

/**
 * @typedef {Object} DocletParameters
 * @property {String} [name] - the name given to the parameter, either explicitly, or implied by the source code
 * @property {DocletTypeNames} [type] - a list of types identifying the given parameter
 * @property {String} [description] - the text describing the parameter
 * @property {Boolean} [variable] - whether the parameter accepts a variable number of values
 * @property {Boolean} [optional] - whether the parameter has been marked as required or optional
 * @property {String} [defaultvalue] - the default value of the given parameter
 * @property {DocletProperties[]} [subitems] - a list of items describing child properties for the given parameter
 */

/**
 * @typedef {Object} DocletReturns
 * @property {DocletTypeNames} [type] - a list of types associated with the given return value
 * @property {String} [description] - the text describing the returned value of the given types
 */

/**
 * @typedef {Object} DocletExceptions
 * @property {DocletTypeNames} [type] - a list of types associated with the thrown exception
 * @property {String} [description] - the text describing the thrown exception
 */

/**
 * @typedef {Object} DocletExamples
 * @property {String} [caption] - the text directly following the example tag, wrapped by a caption element, if any
 * @property {String} [code] - the text between the line below the preceding example tag, and any following tag in the doclet
 */