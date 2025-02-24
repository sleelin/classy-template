const path = require("path");
const helper = require("jsdoc/lib/jsdoc/util/templateHelper");
const Syntax = require("jsdoc/src/syntax").Syntax;
const nodeToValue = require("jsdoc/src/astnode").nodeToValue;

exports.defineTags = function (dictionary) {
    const tags = {
        enum: dictionary.lookUp("enum"),
        const: dictionary.lookUp("const"),
        description: dictionary.lookUp("description"),
        classdesc: dictionary.lookUp("classdesc")
    };
    
    // Treat "enum" tags as "constant" tags...
    dictionary.defineTag("const", {
        ...tags.const,
        onTagged(doclet, tag) {
            tags.const.onTagged(doclet, tag);
            
            // ...but still flag them as enums
            if (tag.originalTitle === "enum")
                tags.enum.onTagged(doclet, tag);
            
            // Handle types declared via annotation not tied to a value
            if (tag.value?.type?.names && !doclet.meta?.code?.value) {
                delete doclet.type;
                doclet.defaultvalue = JSON.stringify(tag.value.type.names);
                doclet.defaultvaluetype = "array";
            }
        }
    }).synonym("enum");
    
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
    
    // Add explicit "overrides" tag
    dictionary.defineTag("overrides", {
        canHaveType: true,
        mustNotHaveDescription: true,
        onTagged(doclet, {value}) {
            doclet.overrides = doclet.overrides ?? [];
            doclet.overrides.push(...value?.type?.names);
        }
    });
    
    // Define "template" tags for handling type parameters
    dictionary.defineTag("template", {
        canHaveName: true,
        canHaveType: true,
        mustHaveValue: true,
        onTagged(doclet, {value}) {
            doclet.templates = (doclet.templates ?? new Map()).set(value.name, value);
        }
    }).synonym("typeParam").synonym("typeparam");
};

/**
 * Collection of methods that filter doclets, or return methods that filter doclets
 * @typedef {Object.<string, (function|FilterMethod)>} Filters
 */
const Filters = {
    /**
     * @callback FilterMethod
     * @param {ClassyDoclet} d - the doclet being filtered
     * @returns {Boolean} whether the given doclet meets the test
     */
    
    /**
     * Checks whether the given doclet has an associated comment
     * @type {FilterMethod}
     */
    hasComment: (d) => (!!d.comment),
    /**
     * Checks whether the given doclet is marked as undocumented
     * @type {FilterMethod}
     */
    isUndocumented: (d) => (d.undocumented),
    /**
     * Checks whether the given doclet is marked as documented
     * @type {FilterMethod}
     */
    isDocumented: (d) => (!d.undocumented),
    /**
     * Checks whether the given doclet is for a constant symbol
     * @type {FilterMethod}
     */
    isConstant: (d) => (d.kind === "constant"),
    /**
     * Checks whether the given doclet is documented and for a class symbol
     * @type {FilterMethod}
     */
    isClass: (d) => (Filters.isDocumented(d) && d.kind === "class"),
    /**
     * Checks whether the given doclet is documented and for an interface symbol
     * @type {FilterMethod}
     */
    isInterface: (d) => (Filters.isDocumented(d) && d.kind === "interface"),
    /**
     * Checks whether the given doclet is documented and for a class-like symbol
     * @type {FilterMethod}
     */
    isClassLike: (d) => (Filters.isDocumented(d) && ["module", "namespace", "class", "interface"].includes(d.kind)),
    /**
     * Checks whether the given doclet is documented and for a container symbol
     * @type {FilterMethod}
     */
    isContainer: (d) => (Filters.isDocumented(d) && ["module", "class", "namespace", "mixin", "external", "interface"].includes(d.kind)),
    /**
     * Checks whether the given doclet is documented and for a module symbol
     * @type {FilterMethod}
     */
    isModule: (d) => (Filters.isDocumented(d) && d.kind === "module"),
    /**
     * Create a method to check whether a given doclet can be found in the same source file as specified
     * @param {String} filepath - the path to the directory the given doclet's source file belongs to 
     * @param {String} filename - the name of the source file the given doclet should be found in 
     * @returns {FilterMethod} method to determine whether a given doclet is found in the same source file as specified
     */
    isInSameFile: (filepath, filename) => ((d) => (d?.meta?.path === filepath && d?.meta?.filename === filename)),
    /**
     * Checks whether the given doclet is documented and has a default value not explicitly marked by the @default tag
     * @type {FilterMethod}
     */
    hasDefaultValue: (d) => (Filters.isDocumented(d) && d.defaultvalue === undefined && d?.meta?.code?.value),
    /**
     * Create a method to check whether a given doclet's node name or leading comment match those specified
     * @param {String} name - the name of the documented symbol to compare with
     * @param {String} comment - the leading comment to search a doclet's node for
     * @returns {FilterMethod} method to determine whether a given doclet's node name or leading comment match those specified
     */
    hasMatchingNode: (name, comment) => (({meta: {code: {node}}}) => (name === node?.id?.name || comment === `/*${(node?.leadingComments ?? node?.parent?.leadingComments)?.slice?.(-1)?.pop?.()?.value ?? ""}*/`))
}

exports.handlers = {
    symbolFound(e) {
        const {node} = e.code ?? {};
        const {type, value} = node ?? {};
        
        // Class properties with default values shouldn't need to explicitly declare themselves
        if (type === Syntax.ClassProperty && !!value) e.code.value = nodeToValue(value);
    },
    jsdocCommentFound: (e) => {
        // Remove all "typeof" and "keyof" instances in comments, since JSDoc doesn't know what to do with them yet
        while (e.comment.match(/\{(.*?)(?:typeof|keyof)\s+(.*?)}/g)) {
            e.comment = String(e.comment ?? "").replaceAll(/\{(.*?)(?:typeof|keyof)\s+(.*?)}/g, "{$1$2}");
        }
        
        // Remove trailing "=" from types denoting TypeScript optional types from comments
        while (e.comment.match(/\{(.*?)=}/g)) {
            e.comment = String(e.comment ?? "").replaceAll(/\{(.*?)=}/g, "{$1}");
        }
        
        // Make ternary expressions into regular arrays :(
        while (e.comment.match(/\{\[(.*?)]}/g)) {
            e.comment = String(e.comment ?? "").replaceAll(/\{\[(.*?)]}/g, "{$1[]}");
        }
    },
    parseComplete(e) {
        // console.log(e.doclets.filter((d) => d.longname === "SCIMMY.Types.Resource"))
        
        // Go through source files to get classdesc from class or interface constructors
        for (let sourcefile of e.sourcefiles) {
            // Get doclets within this source file, then get doclets that are commented and sort by line number
            const symbols = [...e.doclets].filter(Filters.isInSameFile(path.dirname(sourcefile), path.basename(sourcefile)));
            const doclets = symbols.filter(Filters.hasComment).sort((a, b) => a?.meta?.lineno - b?.meta?.lineno);
            
            // Fix duplication of classes due to mishandled constructors
            for (let d of symbols) if (d?.meta?.code?.node?.kind === "constructor") d.undocumented = true;
            
            // Go through and fix various issues with tags and generally incorrect doclet details
            fixDocletMetaCodeNodes(doclets.filter(Filters.isDocumented).filter(Filters.isConstant), symbols.filter(Filters.isUndocumented));
            fixDocletDefaultValues(symbols.filter(Filters.hasDefaultValue).filter((d) => !Filters.isContainer(d)));
            fixDocletMetaCodeNodes(doclets.filter(Filters.isClassLike), symbols);
            fixDocletClassConstructors(doclets.filter(Filters.isClass), doclets);
            fixDocletClassConstructors(doclets.filter(Filters.isInterface), doclets);
            fixDocletModules(doclets.filter(Filters.isModule), doclets.filter(Filters.isClassLike));
            fixDocletDescendants(doclets.filter(Filters.isContainer), doclets);
        }
    }
};

/**
 * Set default values when the @default tag was omitted, but surrounding code has a value
 * @param {ClassyDoclet[]} doclets - list of doclets to iterate through and fix
 */
function fixDocletDefaultValues(doclets) {
    for (let d of doclets) {
        d.defaultvalue = d.meta.code.value;
        
        // Get the default value type from the underlying node
        for (let {type} of [d.meta.code.node, d.meta.code.node?.value ?? {}]) {
            if (type === Syntax.ArrayExpression) d.defaultvaluetype = "array";
            if (type === Syntax.ObjectExpression) d.defaultvaluetype = "object";
        }
    }
}

/**
 * Find and set missing AST nodes belonging to the given doclets
 * @param {ClassyDoclet[]} targets - list of targets to iterate through and fix
 * @param {ClassyDoclet[]} doclets - list of doclets that may have the given target's missing AST node
 */
function fixDocletMetaCodeNodes(targets, doclets) {
    // Go through all doclets to find and fix their code references
    for (let target of targets) {
        // Get doclet details for matching, then find any potentially matching symbols
        const {name, comment, meta} = target;
        const matching = doclets.filter(Filters.hasMatchingNode(name, comment));
        // Get the correct code details from the matching symbol (and fix its name)
        const code = Object.assign(matching.pop()?.meta?.code ?? meta.code, {name});
        const range = code?.node?.range;
        
        // Set the correct code details on the doclet!
        Object.assign(meta, {code, ...(!!range ? {range} : {})});
    }
}

/**
 * Find and set missing class constructor details for the given doclets
 * @param {ClassyDoclet[]} targets - list of targets to iterate through and fix
 * @param {ClassyDoclet[]} doclets - list of doclets that may have the given target's missing constructor details
 */
function fixDocletClassConstructors(targets, doclets) {
    // Go through doclets and get the constructor description
    for (let target of targets) if (!target.undocumented) {
        // Get some positional details for finding the next doclet that could be a constructor
        const {title, meta: {range}} = target;
        const [firstPos = Infinity, lastPos = -1] = range ?? [];
        const [nextFirstPos = Infinity, nextLastPos = Infinity] = targets?.[targets.indexOf(target) + 1]?.meta?.range ?? [];
        // Get the first "undocumented" matching doclet to source missing templates from
        const {templates} = doclets.find(({undocumented, kind, longname}) => (undocumented && kind === target.kind && longname === target.longname)) ?? {};
        // Get the first "undocumented" constructor doclet between start and end of class declaration
        const constructor = doclets.find(({meta: {code, range: [start, finish] = []} = {}}) =>
            (code?.node?.kind === "constructor" && start > firstPos && finish < lastPos
                && (start < nextFirstPos || start > nextLastPos))) ?? {};
        const {classdesc, params, properties} = constructor;
        
        // If the descriptions don't match, use class constructor description as the classdesc
        if (!!constructor.description && constructor.description !== target.description) {
            target.classdesc = constructor.description;
        }
        // Otherwise, for classes, assume the description is meant to be the classdesc
        else if (Filters.isClass(target)) {
            target.classdesc = target.description;
            target.description = "";
        }
        
        // Mark the constructor as undocumented and proceed to copy missing details
        Object.assign(constructor, {undocumented: true});
        Object.assign(target, {
            description: target.description === `<p>${title}</p>` ? "" : target.description,
            ...(Filters.isInterface(target) ? {virtual: true} : {}),
            ...(classdesc ? {classdesc} : {}),
            ...(params ? {params} : {}),
            ...(properties ? {properties} : {}),
            templates
        });
    }
}

/**
 * Fix doclets where module membership and scope are incorrect
 * @param {ClassyDoclet[]} targets - list of targets to iterate through and find incorrect members for
 * @param {ClassyDoclet[]} doclets - list of doclets that may be incorrect members of a given target
 */
function fixDocletModules(targets, doclets) {
    // Go through all targets and get their incorrectly assigned members
    for (let target of targets) {
        // Get some positional details for finding all doclets that shouldn't be members of this module
        const {meta: {lineno: firstLine, code}} = target;
        const lastLine = code?.node?.loc?.end?.line ?? 0;
        // Get all doclets that are found outside this container
        const members = doclets.filter(({undocumented, meta: {lineno} = {}}) =>
            (!undocumented && (lineno < firstLine || lineno > lastLine)));
        
        // Fix the symbol's scope, membership, and long name!
        for (let member of members) {
            // But only if they don't already have the correct scope
            if (member.scope === "inner" && member.kind === "namespace") {
                member.setScope("global");
                member.setLongname(member.longname.replace(`${target.longname}~`, ""));
                member.memberof = undefined;
            }
        }
        
        // Mark the module as undocumented if it no longer has any inner members
        Object.assign(target, {undocumented: members.filter(({scope}) => scope === "inner").length === 0});
    }
}

/**
 * Fix doclets where membership and scope aren't explicit
 * @param {ClassyDoclet[]} targets - list of targets to iterate through and find missing children for
 * @param {ClassyDoclet[]} doclets - list of doclets that may be children of a given target
 */
function fixDocletDescendants(targets, doclets) {
    // Go through all targets and get their missing children
    for (let target of targets) {
        // Get some positional details for finding all doclets that could be children of this container
        const {meta: {lineno: firstLine, code}} = target;
        const lastLine = code?.node?.loc?.end?.line ?? 0;
        // Get all doclets that are found between this container and the next
        const children = doclets.filter(({undocumented, meta: {lineno} = {}}) =>
            (!undocumented && (lineno > firstLine && lineno < lastLine)));
        
        // Fix the symbol's scope, membership, and long name!
        for (let child of children) {
            // Only change the scope for method definitions and class properties...
            if ([Syntax.MethodDefinition, Syntax.ClassProperty].includes(child?.meta?.code?.type)) {
                child.setScope(child?.meta?.code?.node?.static ? "static" : "instance");
            }
            
            // ...but always update membership and long name
            child.setMemberof(target.longname);
            child.setLongname(`${target.longname}${helper.scopeToPunc[child.scope]}${child.name}`);
        }
    }
}

/* ************************************************************************ *
 *  For a package whose purpose is documentation of code,                   *
 *  JSDoc 3.x and 4.x is disappointingly lacking in code documentation.     *
 *  As a workaround, the following attempts to fix that...                  *
 * ************************************************************************ */

/**
 * JSDoc's drop-in replacement of (some) of TAFFYDB's functionality
 * @external Salty
 */

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
 * @property {Function} setScope - method to set the doclet's "scope" property
 * @property {Function} setLongname - method to set the doclet's "longname" property
 * @property {Function} setMemberof - method to set the doclet's "memberof" property
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