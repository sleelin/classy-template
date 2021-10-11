const doop = require("jsdoc/util/doop");
const env = require("jsdoc/env");
const fs = require("jsdoc/fs");
const helper = require("jsdoc/util/templateHelper");
const logger = require("jsdoc/util/logger");
const path = require("jsdoc/path");
const Template = require("jsdoc/template").Template;
const JSDocFilter = require("jsdoc/src/filter").Filter;
const JSDocScanner = require("jsdoc/src/scanner").Scanner;
const taffy = require("taffydb").taffy;
const util = require("util");

let outdir = path.normalize(env.opts.destination);
let view;

function tutoriallink(tutorial) {
    return helper.toTutorial(tutorial, null, {tag: "em", classname: "disabled", prefix: "Tutorial: "});
}

function needsSignature({kind, type, meta}) {
    let needsSig = false;

    // function and class definitions always get a signature
    if (kind === "function" || kind === "class") {
        needsSig = true;
    }
    // typedefs that contain functions get a signature, too
    else if (kind === "typedef" && type && type.names && type.names.length) {
        for (let i = 0, l = type.names.length; i < l; i++) {
            if (type.names[i].toLowerCase() === "function") {
                needsSig = true;
                break;
            }
        }
    }
    // and namespaces that are functions get a signature (but finding them is a bit messy)
    else if (kind === "namespace" && meta && meta.code &&
        meta.code.type && meta.code.type.match(/[Ff]unction/)) {
        needsSig = true;
    }

    return needsSig;
}

function getSignatureAttributes({optional, nullable}) {
    const attributes = [];

    if (optional) {
        attributes.push("opt");
    }
    
    if (nullable === true) {
        attributes.push("nullable");
    }
    else if (nullable === false) {
        attributes.push("non-null");
    }

    return attributes;
}

function updateItemName(item) {
    const attributes = getSignatureAttributes(item);
    let itemName = item.name || '';

    if (item.variable) {
        itemName = `&hellip;${itemName}`;
    }

    if (attributes && attributes.length) {
        itemName = util.format(`%s<span class="signature-attributes">%s</span>`, itemName, attributes.join(", "));
    }

    return itemName;
}

function buildItemTypeStrings(item) {
    const types = [];

    if (item && item.type && item.type.names) {
        item.type.names.forEach(name => {
            types.push(helper.linkto(name, helper.htmlsafe(name)));
        });
    }

    return types;
}

function buildAttribsString(attribs) {
    let attribsString = '';

    if (attribs && attribs.length) {
        attribsString = helper.htmlsafe(util.format("(%s) ", attribs.join(", ")));
    }

    return attribsString;
}

function addSignatureParams(f) {
    const params = (f.params || []).filter(({name}) => name && !name.includes(".")).map(updateItemName);
    
    f.signature = util.format("%s(%s)", (f.signature || ''), params.join(", "));
}

function addSignatureReturns(f) {
    const attribs = [];
    let attribsString = '';
    let returnTypes = [];
    let returnTypesString = '';
    const source = f.yields || f.returns;

    // jam all the return-type attributes into an array. this could create odd results (for example,
    // if there are both nullable and non-nullable return types), but let's assume that most people
    // who use multiple @return tags aren't using Closure Compiler type annotations, and vice-versa.
    if (source) {
        source.forEach(item => {
            helper.getAttribs(item).forEach(attrib => {
                if (!attribs.includes(attrib)) attribs.push(attrib);
            });
        });

        attribsString = buildAttribsString(attribs);
        returnTypes = source.map(t => buildItemTypeStrings(t));
    }
    
    if (returnTypes.length) {
        returnTypesString = util.format(" &rarr; %s{%s}", attribsString, returnTypes.join("|"));
    }

    f.signature = `<span class="signature">${f.signature || ''}</span><span class="type-signature">${returnTypesString}</span>`;
}

function addSignatureTypes(f) {
    const types = f.type ? buildItemTypeStrings(f) : [];

    f.signature = `${f.signature || ''}<span class="type-signature">${types.length ? ` :${types.join("|")}` : ''}</span>`;
}

function addAttribs(f) {
    const attribs = helper.getAttribs(f);
    const attribsString = buildAttribsString(attribs);

    f.attribs = util.format(`<span class="type-signature">%s</span>`, attribsString);
}

function getPathFromDoclet({meta}) {
    if (!meta) {
        return null;
    }

    return meta.path && meta.path !== "null" ? path.join(meta.path, meta.filename) : meta.filename;
}

class DocletPage {
    static #pages = new Map();
    
    #doclet;
    #resolveLinks;
    
    constructor(doclet, docs, resolveLinks) {
        if (DocletPage.#pages.has(doclet)) {
            let page = DocletPage.#pages.get(doclet);
            for (let doc of docs) page.docs.add(doc);
            return page;
        }
        
        DocletPage.#pages.set(doclet, this);
        this.#resolveLinks = resolveLinks;
        this.#doclet = doclet;
        this.title = (DocletPage.titles[doclet.kind] || "") + doclet.name;
        this.docs = new Set(docs);
        this.path = getPathFromDoclet(doclet);
        this.link = helper.createLink(doclet);
        
        doclet.attribs = '';
        
        if (doclet.examples) {
            doclet.examples = doclet.examples.map((example) => {
                let caption, code;
            
                if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
                    caption = RegExp.$1;
                    code = RegExp.$3;
                }
            
                return {
                    caption: caption || '',
                    code: code || example
                };
            });
        }
        
        if (doclet.see) {
            doclet.see.forEach((hash, i) => {
                doclet.see[i] = (!/^(#.+)/.test(hash) ? hash : `<a href="${helper.createLink(doclet).replace(/(#.+|$)/, hash)}">${hash}</a>`)
            });
        }
        
        if (doclet.longname) helper.registerLink(doclet.longname, this.link);
        doclet.id = (!this.link.includes("#") ? doclet.name : this.link.split(/#/).pop());
        
        if (needsSignature(doclet)) {
            addSignatureParams(doclet);
            addSignatureReturns(doclet);
            addAttribs(doclet);
        }
    }
    
    shortenPath(shortPath) {
        this.#doclet.meta.shortpath = shortPath;
    }
    
    generate(fileName) {
        for (let doclet of this.docs) {
            // if (doclet.meta) doclet.meta.shortpath = this.#doclet?.meta?.shortpath;
            // console.log(doclet.name, doclet.meta);
        }
        let html = view.render("container.tmpl", {env: env, title: this.title, docs: [...this.docs]});
        fs.writeFileSync(path.join(outdir, fileName || this.link), (this.#resolveLinks !== false ? helper.resolveLinks(html) : html), "utf8");
    }
    
    static titles = {
        module: "Module: ",
        class: "Class: ",
        namespace: "Namespace: ",
        mixin: "Mixin: ",
        external: "External: ",
        interface: "Interface: ",
        source: "Source: "
    }
}

function generateSourceFiles(sourceFiles, encoding = "utf8") {
    for (let file of sourceFiles) {
        let source;
        // links are keyed to the shortened path in each doclet's `meta.shortpath` property
        const sourceOutfile = helper.getUniqueFilename(file.shortened);

        helper.registerLink(file.shortened, sourceOutfile);
        
        try {
            source = {
                kind: "source",
                code: helper.htmlsafe(fs.readFileSync(file.resolved, encoding))
            };
        } catch (ex) {
            logger.error("Error while generating source file %s: %s", file.resolved, ex.message);
        }
        
        new DocletPage({kind: "source", name: file.shortened}, [source], false).generate(sourceOutfile);
    }
}

/**
 * Look for classes or functions with the same name as modules (which indicates that the module
 * exports only that class or function), then attach the classes or functions to the `module`
 * property of the appropriate module doclets. The name of each class or function is also updated
 * for display purposes. This function mutates the original arrays.
 *
 * @private
 * @param {Array.<module:jsdoc/doclet.Doclet>} doclets - The array of classes and functions to
 * check.
 * @param {Array.<module:jsdoc/doclet.Doclet>} modules - The array of module doclets to search.
 */
function attachModuleSymbols(doclets, modules) {
    const symbols = {};

    // build a lookup table
    doclets.forEach(symbol => {
        symbols[symbol.longname] = symbols[symbol.longname] || [];
        symbols[symbol.longname].push(symbol);
    });

    modules.forEach(module => {
        if (symbols[module.longname]) {
            module.modules = symbols[module.longname]
                // Only show symbols that have a description. Make an exception for classes, because
                // we want to show the constructor-signature heading no matter what.
                .filter(({description, kind}) => description || kind === "class")
                .map(symbol => {
                    symbol = doop(symbol);

                    if (symbol.kind === "class" || symbol.kind === "function") {
                        symbol.name = `${symbol.name.replace("module:", `(require("`)}"))`;
                    }

                    return symbol;
                });
        }
    });
}

function wrapTag(tag, content) {
    return `<${tag}>${content}</${tag}>`;
}

function buildStructuredNav(spec, data, seen, depth) {
    let listContent = "",
        items = helper.find(data, spec);
    
    for (let item of items) {
        if (!Object.prototype.hasOwnProperty.call(seen, item.longname)) {
            let title = helper.linkto(item.longname, item.name.replace(/\b(module|event):/g, '')),
                children = buildStructuredNav({memberof: item.longname, kind: ["namespace", "class"]}, data, seen, depth+1);
            
            listContent += wrapTag("li", ((depth < 5 || children.length) ? wrapTag(`h${depth}`, title) : title) + children);
            seen[item.longname] = true;
        }
    }
    
    return listContent.length ? wrapTag("ul", listContent) : "";
}

function buildMemberNav(items, itemHeading, itemsSeen, linktoFn) {
    let nav = '';
    
    if (items.length) {
        let itemsNav = '';

        items.forEach(item => {
            let displayName;

            if (!Object.prototype.hasOwnProperty.call(item, "longname")) {
                itemsNav += `<li>${linktoFn('', item.name)}</li>`;
            }
            else if (!Object.prototype.hasOwnProperty.call(itemsSeen, item.longname)) {
                if (env.conf.templates.default.useLongnameInNav) {
                    displayName = item.longname;
                } else {
                    displayName = item.name;
                }
                itemsNav += `<li>${linktoFn(item.longname, displayName.replace(/\b(module|event):/g, ''))}</li>`;

                itemsSeen[item.longname] = true;
            }
        });

        if (itemsNav !== '') {
            nav += `<h3>${itemHeading}</h3><ul>${itemsNav}</ul>`;
        }
    }

    return nav;
}

/**
 * Create the navigation sidebar.
 * @param {object} members The members that will be used to create the sidebar.
 * @param data
 * @param {array<object>} members.classes
 * @param {array<object>} members.externals
 * @param {array<object>} members.globals
 * @param {array<object>} members.mixins
 * @param {array<object>} members.modules
 * @param {array<object>} members.namespaces
 * @param {array<object>} members.tutorials
 * @param {array<object>} members.events
 * @param {array<object>} members.interfaces
 * @return {string} The HTML for the navigation sidebar.
 */
function buildNav(members, data) {
    let globalNav;
    let nav = `<h2><a href="index.html">Home</a></h2>`;
    const seen = {};
    const seenTutorials = {};
    
    nav += buildStructuredNav({scope: "global"}, data, seen, 3);
    nav += buildMemberNav(members.modules, "Modules", seen, helper.linkto);
    nav += buildMemberNav(members.externals, "Externals", seen, (ln, name) =>  helper.linkto(ln, name.replace(/(^"|"$)/g, '')));
    nav += buildMemberNav(members.namespaces, "Namespaces", seen, helper.linkto);
    nav += buildMemberNav(members.classes, "Classes", seen, helper.linkto);
    nav += buildMemberNav(members.interfaces, "Interfaces", seen, helper.linkto);
    nav += buildMemberNav(members.events, "Events", seen, helper.linkto);
    nav += buildMemberNav(members.mixins, "Mixins", seen, helper.linkto);
    nav += buildMemberNav(members.tutorials, "Tutorials", seenTutorials, (ln, name) => tutoriallink(name));

    if (members.globals.length) {
        globalNav = '';

        members.globals.forEach(({kind, longname, name}) => {
            if (kind !== "typedef" && !Object.prototype.hasOwnProperty.call(seen, longname)) {
                globalNav += `<li>${helper.linkto(longname, name)}</li>`;
            }
            seen[longname] = true;
        });

        if (!globalNav) {
            // turn the heading into a link so you can actually get to the global page
            nav += `<h3>${helper.linkto("global", "Global")}</h3>`;
        } else {
            nav += `<h3>Global</h3><ul>${globalNav}</ul>`;
        }
    }

    return nav;
}

function handleStatics(templatePath, configStatics) {
    // Get list of files to copy from template's static directory
    let fromDir = path.join(templatePath, "static"),
        staticFiles = fs.ls(fromDir, 3).map(fn => ({fileName: fn, fromDir: fromDir}));
    
    // Get list of user-specified static files to copy
    if (configStatics) {
        let {paths, include: staticFilePaths = (paths || [])} = configStatics|| {},
            staticFileFilter = new JSDocFilter(configStatics),
            staticFileScanner = new JSDocScanner();
        
        // Go through user-specified static files
        for (let filePath of staticFilePaths) {
            let fromDir = path.resolve(env.pwd, filePath);
            
            // Add the static file to the list
            staticFiles.push(...staticFileScanner
                .scan([fromDir], 10, staticFileFilter)
                .map(fn => ({fileName: fn, fromDir: fs.toDir(fromDir)})));
        }
    }
    
    // Actually go through and copy the static files
    for (let {fileName, fromDir} of staticFiles) {
        const toDir = fs.toDir(fileName.replace(fromDir, outdir));
        
        fs.mkPath(toDir);
        fs.copyFileSync(fileName, toDir);
    }
}

/**
    @param {TAFFY} data See <http://taffydb.com/>.
    @param {object} opts
    @param {Tutorial} tutorials
 */
exports.publish = (data, opts, tutorials) => {
    let templatePath = path.normalize(opts.template),
        conf = Object.assign(env.conf.templates || {}, {default: env.conf.templates.default || {}}),
        // Claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
        globalUrl = helper.getUniqueFilename("global"),
        indexUrl = helper.getUniqueFilename("index"),
        sourceFiles = new Map(), members;
    
    view = new Template(path.join(templatePath, "tmpl"));
    data = helper.prune(data);
    data.sort("longname, version, since");
    helper.setTutorials(tutorials);
    helper.registerLink("global", globalUrl);
    helper.addEventListeners(data);
    
    // set up templating
    view.layout = !conf.default.layoutFile ? "layout.tmpl"
        : path.getResourcePath(path.dirname(conf.default.layoutFile), path.basename(conf.default.layoutFile));
    
    fs.mkPath(outdir);
    handleStatics(templatePath, conf.default.staticFiles);
    
    for (let doclet of data().get()) {
        let page = new DocletPage(doclet);
        
        if (!!page.path && !sourceFiles.has(page.path)) {
            sourceFiles.set(page.path, {resolved: page.path, shortened: null});
        }
    }
    
    if (sourceFiles.size > 0) {
        let prefix = path.commonPrefix([...sourceFiles.keys()]);
        
        for (let file of sourceFiles.values()) {
            file.shortened = file.resolved.replace(prefix, "").replace(/\\/g, "/");
        }
        
        for (let doclet of data().get()) {
            let docletPath = getPathFromDoclet(doclet);
            
            if (doclet.meta && sourceFiles.has(docletPath)) {
                doclet.meta.shortpath = sourceFiles.get(docletPath).shortened;
            }
        }
    }
    
    // do this after the urls have all been generated
    data().each(doclet => {
        doclet.ancestors = helper.getAncestorLinks(data, doclet);
        
        if (doclet.kind === "member") {
            addSignatureTypes(doclet);
            addAttribs(doclet);
        }
        
        if (doclet.kind === "constant") {
            addSignatureTypes(doclet);
            addAttribs(doclet);
            doclet.kind = "member";
        }
    });
    
    members = helper.getMembers(data);
    members.tutorials = tutorials.children;
    
    // output pretty-printed source files by default
    let outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false;
    
    // add template helpers
    view.find = (spec) => data(spec).get();
    view.linkto = helper.linkto;
    view.resolveAuthorLinks = helper.resolveAuthorLinks;
    view.tutoriallink = tutoriallink;
    view.htmlsafe = helper.htmlsafe;
    view.outputSourceFiles = outputSourceFiles;
    
    // once for all
    view.nav = buildNav(members, data);
    attachModuleSymbols(helper.find(data, {longname: {left: "module:"}}), members.modules);
    
    // generate the pretty-printed source files first so other pages can link to them
    if (outputSourceFiles) generateSourceFiles([...sourceFiles.values()], opts.encoding);
    if (members.globals.length) new DocletPage({name: "Global"}, [{kind: "globalobj"}]).generate(globalUrl);
    
    // Index page displays information from package.json and lists files
    new DocletPage({name: "Home"}, [
        ...helper.find(data, {kind: "package"}),
        ...[{kind: "mainpage", readme: opts.readme, longname: (opts.mainpagetitle) ? opts.mainpagetitle : "Main Page"}],
        ...helper.find(data, {kind: "file"})]).generate(indexUrl);
    
    // for (let page of pages) {
    //     page.generate();
    // }
    
    let doclets = [
        taffy(members.modules),
        taffy(members.classes),
        taffy(members.namespaces),
        taffy(members.mixins),
        taffy(members.externals),
        taffy(members.interfaces)
    ];
    
    for (let members of doclets) {
        for (let doclet of members().get()) {
            new DocletPage(doclet, members({longname: doclet.longname}).get())
                .generate(helper.longnameToUrl[doclet.longname]);
        }
    }
    
    // TODO: move the tutorial functions to templateHelper.js
    function generateTutorial(title, tutorial, filename) {
        const tutorialData = {
            title: title,
            header: tutorial.title,
            content: tutorial.parse(),
            children: tutorial.children
        };
        const tutorialPath = path.join(outdir, filename);
        let html = view.render("tutorial.tmpl", tutorialData);

        // yes, you can use {@link} in tutorials too!
        html = helper.resolveLinks(html); // turn {@link foo} into <a href="foodoc.html">foo</a>

        fs.writeFileSync(tutorialPath, html, "utf8");
    }
    
    // tutorials can have only one parent so there is no risk for loops
    function saveChildren({children}) {
        children.forEach((child) => {
            generateTutorial(`Tutorial: ${child.title}`, child, helper.tutorialToUrl(child.name));
            saveChildren(child);
        });
    }

    saveChildren(tutorials);
};
