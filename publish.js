const util = require("util");
const env = require("jsdoc/env");
const fs = require("jsdoc/fs");
const helper = require("jsdoc/util/templateHelper");
const logger = require("jsdoc/util/logger");
const path = require("jsdoc/path");
const JSDocTemplate = require("jsdoc/template").Template;
const JSDocFilter = require("jsdoc/src/filter").Filter;
const JSDocScanner = require("jsdoc/src/scanner").Scanner;

let outdir = path.normalize(env.opts.destination);
let view;

class PublishUtils {
    static bootstrapTemplate(templatePath, layoutFile, data, outputSourceFiles) {
        return Object.assign(new JSDocTemplate(path.join(templatePath, "tmpl")), {
            layout: !layoutFile ? "layout.tmpl" : path.getResourcePath(path.dirname(layoutFile), path.basename(layoutFile)),
            find: (spec) => data(spec).get(),
            linkto: helper.linkto,
            resolveAuthorLinks: helper.resolveAuthorLinks,
            tutoriallink: PublishUtils.linkTutorial,
            htmlsafe: helper.htmlsafe,
            outputSourceFiles: outputSourceFiles
        });
    }
    
    static handleStatics(templatePath, configStatics) {
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
    
    static linkTutorial(t) {
        return helper.toTutorial(t, null, {tag: "em", classname: "disabled", prefix: "Tutorial: "});
    }
    
    static generateTutorials({children}) {
        for (let child of children) {
            fs.writeFileSync(
                path.join(outdir, helper.tutorialToUrl(child.name)),
                helper.resolveLinks(view.render("masters/tutorial.tmpl", {
                    title: `Tutorial: ${child.title}`,
                    header: child.title,
                    content: child.parse(),
                    children: child.children
                })),
                "utf8"
            );
            
            PublishUtils.generateTutorials(child);
        }
    }
    
    static typeStrings({type}) {
        return (type?.names || []).map(name => helper.linkto(name, helper.htmlsafe(name)));
    }
    
    static attribsString(attribs) {
        return attribs.length ? helper.htmlsafe(`(${attribs.join(", ")})`) : "";
    }
    
    static buildNav(members, data) {
        let nav = [`<h2><a href="index.html">Home</a></h2>`],
            seen = {},
            linkFns = {
                Externals: (ln, name) =>  helper.linkto(ln, name.replace(/(^"|"$)/g, '')),
                Tutorials: (ln, name) => PublishUtils.linkTutorial(name)
            };
        
        nav.push(...[
            PublishUtils.buildStructuredNav({scope: "global", kind: DocletPage.types}, data, seen, 3),
            ...["Modules", "Namespaces", "Classes", "Interfaces", "Events", "Mixins", "Externals", "Tutorials"].map(scope =>
                PublishUtils.buildMemberNav(members[scope.toLowerCase()], scope, scope === "Tutorials" ? {} : seen, linkFns[scope] ?? helper.linkto)),
        ]);
        
        if (members.globals.length) {
            let globalNav = members.globals.map(m => {
                let {kind, longname, name} = m,
                    out = ((String(kind) !== "typedef" && !seen[longname]) ? `<li>${helper.linkto(longname, name)}</li>` : "");
                
                seen[longname] = true;
                return out;
            }).join("");
            
            // Turn the heading into a link so you can actually get to the global page
            nav.push(!globalNav ? `<h3>${helper.linkto("global", "Global")}</h3>` : `<h3>Global</h3><ul>${globalNav}</ul>`);
        }
        
        return nav.join("");
    }
    
    static buildStructuredNav(spec, data, seen, depth) {
        let listContent = "",
            items = helper.find(data, spec);
        
        for (let item of items) {
            if (!(seen[item.longname])) {
                let title = helper.linkto(item.longname, item.name.replace(/\b(module|event):/g, '')),
                    children = PublishUtils.buildStructuredNav({memberof: item.longname, kind: ["namespace", "class"]}, data, seen, depth+1);
                
                listContent += `<li>${((depth < 5 || children.length) ? `<h${depth}>${title}</h${depth}>` : title) + children}</li>`;
                seen[item.longname] = true;
            }
        }
        
        return listContent.length ? `<ul>${listContent}</ul>` : "";
    }
    
    static buildMemberNav(items, heading, seen, linktoFn) {
        let nav = items.map(item => {
            if (!item.longname) {
                return `<li>${linktoFn("", item.name)}</li>`;
            } else if (!seen[item.longname]) {
                let displayName = env.conf.templates.default.useLongnameInNav ? item.longname : item.name;
                seen[item.longname] = true;
                return `<li>${linktoFn(item.longname, displayName.replace(/\b(module|event):/g, ''))}</li>`;
            }
        }).join("");
        
        return nav.length ? `<h3>${heading}</h3><ul>${nav}</ul>` : "";
    }
}

class DocletPage {
    static #pages = new Map();
    static #sources = new Map();
    #resolveLinks;
    
    constructor(doclet, docs, resolveLinks) {
        if (DocletPage.#pages.has(doclet)) {
            let page = DocletPage.#pages.get(doclet);
            for (let doc of docs) page.docs.add(doc);
            return page;
        }
        
        DocletPage.#pages.set(doclet, this);
        this.#resolveLinks = resolveLinks;
        this.longname = doclet.longname;
        this.env = env;
        this.doclet = doclet;
        this.docs = new Set(docs);
        this.path = doclet?.meta?.source;
        this.link = helper.createLink(doclet);
        this.title = (DocletPage.titles[doclet.kind] || "")
            + `<span class="ancestors">${(doclet.ancestors || []).join("")}</span>` + doclet.name;
        
        if (!DocletPage.#sources.has(this.path)) {
            DocletPage.#sources.set(this.path, {resolved: this.path, shortened: null});
        }
        
        for (let doclet of docs) {
            if (doclet.examples) {
                doclet.examples = doclet.examples.map((example) => {
                    let caption, code;
                    
                    if (example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
                        caption = RegExp.$1;
                        code = RegExp.$3;
                    }
                    
                    return {
                        caption: caption || "",
                        code: code || example
                    };
                });
            }
            
            if (doclet.see) {
                doclet.see.forEach((hash, i) => {
                    doclet.see[i] = (!/^(#.+)/.test(hash) ? hash : `<a href="${doclet.link.replace(/(#.+|$)/, hash)}">${hash}</a>`)
                });
            }
        }
    }
    
    generate(fileName) {
        let html = view.render("container.tmpl", Object.assign(this, {docs: [...this.docs.values()]}));
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
    };
    
    static types = Object.keys(DocletPage.titles);
    
    static restructure(doclets, data) {
        for (let doclet of doclets) {
            // Go through all containers that get their own page
            if (doclet.meta && DocletPage.types.includes(doclet.kind)) {
                let {filename, path, lineno} = doclet.meta,
                    // Get all container symbols in the same file as the doclet
                    next = data({meta: {filename: filename, path: path}, kind: DocletPage.types}).get()
                        // Work out the next container symbol in the same file (if any)
                        .filter(d => d?.meta?.lineno > lineno).sort((a, b) => a.meta.lineno - b.meta.lineno).shift(),
                    // Get all non-container symbols in the file
                    children = data({meta: {filename: filename, path: path}},
                        ...DocletPage.types.map(t => ({kind: {"!is": t}}))).get()
                        // And find ones that lie between this container and the next container
                        .filter(c => (["MethodDefinition"].includes(c?.meta?.code?.type)
                            && (c?.meta?.lineno > lineno) && (!next || c?.meta?.lineno < next?.meta?.lineno)));
                
                // Fix the symbol's scope, membership, and long name!
                for (let child of children) {
                    child.setScope(child?.meta?.code?.node?.static ? "static" : "instance");
                    child.setMemberof(doclet.longname);
                    child.setLongname(`${doclet.longname}${helper.scopeToPunc[child.scope]}${child.name}`);
                }
                
                // Go deeper with page containing symbols
                DocletPage.restructure(data({memberof: doclet.longname, kind: DocletPage.types}).get(), data);
            }
        }
    }
    
    static declare(doclets) {
        for (let doclet of doclets) {
            doclet.attribs = "";
            doclet.link = helper.createLink(doclet);
            doclet.id = (!doclet.link.includes("#") ? doclet.name : doclet.link.split(/#/).pop());
            if (doclet.longname) helper.registerLink(doclet.longname, doclet.link);
            if (doclet.meta) {
                let {path: dir, filename: fn} = doclet.meta;
                doclet.meta.source = dir && dir !== "null" ? path.join(dir, fn) : fn;
            }
        }
    }
    
    static inherit(doclets, data) {
        for (let doclet of doclets) {
            // Establish inheritance for supplied doclets, where supported
            if (!!doclet?.meta) {
                // Establish initial inheritance chain for the doclet, as well as whether or not it is a container-generating doclet
                let inheritance = new Set([...(doclet.augments ?? []), ...(doclet.implements ?? []), ...(doclet.overrides ?? [])]),
                    isContainer = (doclet.kind in DocletPage.titles);
                
                // If it's not a container, it must have a parent
                if (!isContainer) {
                    // See if we can find the containing parent
                    let {filename, path} = doclet.meta,
                        parent = data({meta: {filename: filename, path: path}}, [{name: doclet.memberof}, {longname: doclet.memberof}]).first();
                    
                    if (!!parent?.augments) {
                        // If the parent inherits from somewhere, assume this symbol might inherit from there too
                        for (let target of Array.isArray(parent.augments) ? parent.augments : [parent.augments]) {
                            inheritance.add(`${target}${helper.scopeToPunc[doclet.scope || "instance"]}${doclet.name}`);
                        }
                    }
                }
                
                // Apply inheritance if necessary!
                if (inheritance.size > 0) {
                    // Establish details of the symbol to inherit from
                    let {name, kind, scope} = doclet,
                        // Only inherit from the first name in the list
                        longname = inheritance.values().next().value,
                        inheritable = data(...[
                            // See if we can find a symbol to inherit from
                            {longname: longname, kind: kind, ...(!!scope && !isContainer ? {scope: scope} : {})},
                            (isContainer ? [] : [[{name: name}, {alias: name}]])
                        ].flat()).first();
                    
                    // If so, apply inheritance to inheritable tags
                    if (!!inheritable) {
                        for (let key of ["description", "examples", "see", "params", "type", "returns"]) {
                            // Only if the tag isn't already defined on the doclet
                            if (!Object.keys(doclet[key] ?? "").length) doclet[key] = inheritable[key];
                        }
                    }
                }
            }
            
            // Get ancestor links for the doclet
            doclet.ancestors = helper.getAncestorLinks(data, doclet);
        }
    }
    
    static sign(doclets) {
        for (let doclet of doclets) {
            let {kind, type, meta, signature = "", params = []} = doclet,
                // Add types to signatures of constants and members
                needsTypes = ["constant", "member"].includes(kind),
                // Functions and classes automatically get signatures
                needsSignature = ["function", "class"].includes(kind)
                    // Typedefs that contain functions get a signature, too
                    || (kind === "typedef" && (type?.names || []).some(t => t.toLowerCase() === "function"))
                    // And namespaces that are functions get a signature (but finding them is a bit messy)
                    || (kind === "namespace" && meta?.code?.type?.match(/[Ff]unction/));
            
            if (needsSignature) {
                let source = doclet.yields || doclet.returns || [],
                    // Prepare attribs and returns signatures
                    attribs = PublishUtils.attribsString([...new Set(source.map(item => helper.getAttribs(item)).flat())]),
                    returns = source.map(s => PublishUtils.typeStrings(s)).join("|"),
                    // Prepare params signature
                    args = params.filter(({name}) => name && !name.includes(".")).map((item) => {
                            let {variable, optional, nullable} = item,
                                name = (variable ? `&hellip;${item.name}` : item.name),
                                attributes = [...(optional ? ["opt"] : []),
                                    ...(nullable === true ? ["nullable"] : []),
                                    ...(nullable === false ? ["non-null"] : [])].join(", ");
                            
                            // Return parameter name with trailing attributes if necessary
                            return name + (attributes.length > 0 ? `<span class="signature-attributes">${attributes}</span>` : "");
                        })
                        .join(", ");
                
                // Add params to the signature, then add attribs and returns to the signature
                doclet.signature = `<span class="signature">${signature}(${args})</span>`;
                doclet.signature += `<span class="type-signature">${returns.length ? ` &rarr; ${attribs}{${returns}}` : ""}</span>`;
            } else if (needsTypes) {
                let types = PublishUtils.typeStrings(doclet);
                
                // Add types to the signature
                doclet.signature = `${signature}<span class="type-signature">${types.length ? `: ${types}` : ""}</span>`;
                if (kind === "constant") doclet.kind = "member";
            }
            
            if (needsSignature || needsTypes) {
                // Add the attributes tag if signatures or types were set above
                doclet.attribs = `<span class="type-signature">${PublishUtils.attribsString(helper.getAttribs(doclet))} </span>`;
            }
        }
    }
    
    static sources(doclets, gitPath = false, encoding = "utf8") {
        let pages = [];
        
        if (!!doclets && DocletPage.#sources.size > 0) {
            let prefix = path.commonPrefix([...DocletPage.#sources.keys()]);
            
            for (let file of [...DocletPage.#sources.values()]) {
                file.shortened = file.resolved.replace(prefix, "").replace(/\\/g, "/");
                helper.registerLink(file.shortened, helper.getUniqueFilename(file.shortened));
                
                if (!gitPath) {
                    try {
                        let doclet = {kind: "source", name: file.shortened, longname: file.shortened},
                            docs = [{kind: "source", code: helper.htmlsafe(fs.readFileSync(file.resolved, encoding))}];
                        
                        pages.push(new DocletPage(doclet, docs, false));
                    } catch (ex) {
                        logger.error(`Error while generating source file ${file.resolved}: ${ex.message}`);
                    }
                }
            }
        
            for (let doclet of doclets) {
                if (doclet.meta && DocletPage.#sources.has(doclet.meta.source)) {
                    doclet.meta.shortpath = DocletPage.#sources.get(doclet.meta.source).shortened;
                }
            }
        }
        
        return pages;
    }
}

/**
 * @param {TAFFY} data - See <http://taffydb.com/>.
 * @param {Object} opts
 * @param {Tutorial} tutorials
 */
exports.publish = (data, opts, tutorials) => {
    let templatePath = path.normalize(opts.template),
        conf = Object.assign(env.conf.templates || {}, {default: env.conf.templates.default || {}}),
        // Claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
        globalUrl = helper.getUniqueFilename("global"),
        indexUrl = helper.getUniqueFilename("index"),
        outputSourceFiles = conf?.default?.outputSourceFiles !== false,
        pages = [];
    
    // Get things ready
    helper.prune(data);
    helper.setTutorials(tutorials);
    helper.registerLink("global", globalUrl);
    helper.addEventListeners(data);
    fs.mkPath(outdir);
    
    // Set up templating and handle static files
    view = PublishUtils.bootstrapTemplate(templatePath, conf.default.layoutFile, data, outputSourceFiles);
    PublishUtils.handleStatics(templatePath, conf.default.staticFiles);
    
    // Prepare all doclets for consumption
    DocletPage.restructure(data({scope: "global", kind: DocletPage.types}).get(), data);
    DocletPage.declare(data().get());
    DocletPage.inherit(data().get(), data);
    DocletPage.sign(data().get(), data);
    pages.push(...[
        // Create pages for all container-type doclets
        ...data({kind: DocletPage.types}).get()
            .map(doclet => new DocletPage(doclet, data({longname: doclet.longname}).get())),
        // ...as well as any corresponding source files, if enabled, and gitPath not specified
        ...(outputSourceFiles ? DocletPage.sources(data().get(), false, opts.encoding) : [])
    ]);
    
    // TODO: unique nav for each page (to highlight active link)
    let members = Object.assign(helper.getMembers(data), {tutorials: tutorials.children});
    view.nav = PublishUtils.buildNav(members, data);
    
    // Index page displays information from package.json and lists files
    pages.unshift(...[
        ...(members.globals.length ? [new DocletPage({name: "Global", longname: globalUrl}, [{kind: "globalobj"}])] : []),
        new DocletPage({name: "Home", longname: indexUrl}, [
            ...data({kind: "package"}).get(),
            ...[{kind: "mainpage", readme: opts.readme, longname: (opts.mainpagetitle) ? opts.mainpagetitle : "Main Page"}],
            ...data({kind: "file"}).get()
        ])
    ]);
    
    // Generate all the pages, then generate the tutorials!
    for (let page of pages) page.generate(helper.longnameToUrl[page.longname] ?? page.longname);
    PublishUtils.generateTutorials(tutorials);
};