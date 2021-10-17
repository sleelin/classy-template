const fs = require("fs");
const path = require("path");
const env = require("jsdoc/env");
const helper = require("jsdoc/util/templateHelper");
const logger = require("jsdoc/util/logger");
const JSDocFS = require("jsdoc/fs");
const JSDocPath = require("jsdoc/path");
const JSDocTemplate = require("jsdoc/template").Template;
const JSDocFilter = require("jsdoc/src/filter").Filter;
const JSDocScanner = require("jsdoc/src/scanner").Scanner;
const {JSDOM} = require("jsdom");

let outdir = path.normalize(env.opts.destination);
let view;

class PublishUtils {
    static bootstrapTemplate(templatePath, layoutFile, data, packageData, sourceFiles) {
        return Object.assign(new JSDocTemplate(path.join(templatePath, "tmpl")), {
            layout: !layoutFile ? "layout.tmpl" : JSDocPath.getResourcePath(path.dirname(layoutFile), path.basename(layoutFile)),
            find: (spec) => data(spec).get(),
            linkto: helper.linkto,
            resolveAuthorLinks: helper.resolveAuthorLinks,
            tutoriallink: PublishUtils.linkTutorial,
            htmlsafe: helper.htmlsafe,
            packageData: packageData,
            sourceFiles: sourceFiles
        });
    }
    
    static handleStatics(templatePath, defaultStatics, classyStatics) {
        // Get list of files to copy from template's static directory
        let fromDir = path.join(templatePath, "static"),
            staticFiles = JSDocFS.ls(fromDir, 3).map(fn => ({sourcePath: fn, fromDir: fromDir}));
        
        // Get list of user-specified static files to copy
        if (defaultStatics) {
            let {paths, include: staticFilePaths = (paths || [])} = defaultStatics || {},
                staticFileFilter = new JSDocFilter(defaultStatics),
                staticFileScanner = new JSDocScanner();
            
            // Go through user-specified static files
            for (let filePath of staticFilePaths) {
                let fromDir = path.resolve(env.pwd, filePath);
                
                // Add the static file to the list
                staticFiles.push(...staticFileScanner
                    .scan([fromDir], 10, staticFileFilter)
                    .map(fn => ({sourcePath: fn, fromDir: JSDocFS.toDir(fromDir)})));
            }
        }
        
        // Copy static assets from
        if (classyStatics) {
            let {logo} = classyStatics;
            
            if (typeof logo === "string") {
                staticFiles.push({
                    sourcePath: path.resolve(env.pwd, logo),
                    fileName: `assets/logo${path.extname(logo)}`,
                    fromDir: JSDocFS.toDir(path.dirname(path.resolve(env.pwd, logo)))
                });
            }
        }
        
        // Actually go through and copy the static files
        for (let {sourcePath, fromDir, fileName} of staticFiles) {
            const toDir = JSDocFS.toDir(sourcePath.replace(fromDir, path.join(outdir, "static")));
            
            JSDocFS.mkPath(path.join(toDir, path.dirname(fileName ?? "")));
            JSDocFS.copyFileSync(sourcePath, toDir, fileName);
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
        let nav = [],
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
    
    static getRepository(packagePath, repository) {
        // Break if package.json or repository are undefined
        if (!repository || !packagePath) return {};
        
        // Only look for .git folders next to specified package.json
        let gitDir = path.join(path.dirname(path.resolve(env.pwd, packagePath)), ".git");
        
        // Only continue if git dir exists
        if (fs.existsSync(gitDir)) {
            try {
                let ref = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").replace("ref: ", "").trim(),
                    commitish = fs.readFileSync(path.join(gitDir, ref), "utf8").trim();
                
                return PublishUtils.resolveGitHost(repository, commitish) ?? {};
            } catch (ex) {
                // Do nothing, repository can't be resolved
            }
        }
        
        return {};
    }
    
    // Map common Git hosts to their source file path link format and line tag prefix
    static #gitHosts = {
        github: (path, commitish) => ({path: `https://github.com/${path}/blob/${commitish}/`, line: "L"}),
        bitbucket: (path, commitish) => ({path: `https://bitbucket.org/${path}/src/${commitish}/`, line: "line-"}),
        gitlab: (path, commitish) => ({path: `https://gitlab.com/${path}/blob/${commitish}/`, line: "L"})
    }
    
    static resolveGitHost(repository, commitish) {
        if (typeof repository === "string") {
            // Get repository details if specified in short form
            let [host, repo = host] = repository.split(":");
            
            // Get the host's path details as above
            return PublishUtils.#gitHosts[host === repo ? "github" : host](repo, commitish);
        } else if (repository?.type === "git" && !!repository?.url) {
            // Extract git host and repository details from full link
            let target = new URL(repository.url.replace(/^(?:git\+)?(.*?)(?:\.git)?$/, "$1"));
            
            // Then try again with a string value instead
            return PublishUtils.resolveGitHost(`${target.host.split(".").shift()}:${target.pathname.substring(1)}`, commitish);
        }
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
        this.heading = (DocletPage.titles[doclet.kind] || "")
            + `<span class="ancestors">${(doclet.ancestors || []).join("")}</span>` + doclet.name;
        this.title = (DocletPage.titles[doclet.kind] || "") + doclet.name;
        
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
    
    render() {
        let html = view.render("container.tmpl", Object.assign(this, {docs: [...this.docs.values()]}));
        return (this.#resolveLinks !== false ? helper.resolveLinks(html) : html);
    }
    
    generate(fileName) {
        fs.writeFileSync(path.join(outdir, fileName || this.link), this.render(), "utf8");
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
    
    static declare(doclets, apiEntry, indexUrl) {
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
        
        if (!!apiEntry && indexUrl) {
            helper.registerLink(apiEntry, indexUrl);
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
    
    static sources(doclets, {_: files, encoding = "utf8"}, repositoryPath = false) {
        let pages = [],
            // Get the real prefix of the source files, as JSDoc strips it!
            realPrefix = files
                .reduce((prefix, file) => (!prefix ? file : prefix.split("").filter((c, i) => c === file[i]).join("")))
                .replace(/\\/g, "/");
        
        if (!!doclets && DocletPage.#sources.size > 0) {
            // Find common full path prefix to replace
            let commonPrefix = JSDocPath.commonPrefix([...DocletPage.#sources.keys()]);
            
            for (let file of [...DocletPage.#sources.values()]) {
                // Add the shortened path and register the link
                file.shortened = file.resolved.replace(commonPrefix, realPrefix + (realPrefix.endsWith("/") ? "" : "/")).replace(/\\/g, "/");
                helper.registerLink(file.shortened, !!repositoryPath ? `${repositoryPath}${file.shortened}` : helper.getUniqueFilename(file.shortened));
                
                // If repository path not specified, assume pages must be generated for source files
                if (!repositoryPath) {
                    try {
                        // So attempt to do that
                        let doclet = {kind: "source", name: file.shortened, longname: file.shortened},
                            docs = [{kind: "source", code: helper.htmlsafe(fs.readFileSync(file.resolved, encoding))}];
                        
                        pages.push(new DocletPage(doclet, docs, false));
                    } catch (ex) {
                        logger.error(`Error while generating source file ${file.resolved}: ${ex.message}`);
                    }
                }
            }
        
            for (let doclet of doclets) {
                // Update the short path for all doclets
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
        conf = Object.assign(
            env.conf.templates || {},
            {default: env.conf.templates.default || {}},
            {classy: env.conf.templates.classy || {}}
        ),
        packageData = Object.assign(
            data({kind: "package"}).first() || {},
            (conf.classy.name ? {name: conf.classy.name} : {}),
            (conf.classy.logo ? {logo: `static/assets/logo${path.extname(conf.classy.logo)}`} : {}),
            {showName: conf.classy.showName ?? true}
        ),
        sourceFiles = {
            output: conf?.default?.outputSourceFiles !== false, line: "line",
            ...PublishUtils.getRepository(opts.package, packageData.repository)
        },
        // Claim some special filenames in advance, so the All-Powerful Overseer of Filename Uniqueness
        globalUrl = helper.getUniqueFilename("global"),
        indexUrl = helper.getUniqueFilename("index"),
        pages = [];
    
    // Get things ready
    helper.prune(data);
    helper.setTutorials(tutorials);
    helper.registerLink("global", globalUrl);
    helper.addEventListeners(data);
    JSDocFS.mkPath(outdir);
    
    // Set up templating and handle static files
    view = PublishUtils.bootstrapTemplate(templatePath, conf.default.layoutFile, data, packageData, sourceFiles);
    PublishUtils.handleStatics(templatePath, conf.default.staticFiles, conf.classy);
    
    // Prepare all doclets for consumption
    DocletPage.restructure(data({scope: "global", kind: DocletPage.types}).get(), data);
    DocletPage.declare(data().get(), conf.classy.apiEntry, indexUrl);
    DocletPage.inherit(data().get(), data);
    DocletPage.sign(data().get(), data);
    pages.push(...[
        // Create pages for all container-type doclets
        ...data({kind: DocletPage.types}).get()
            .map(doclet => new DocletPage(doclet, data({longname: doclet.longname}).get())),
        // ...as well as any corresponding source files, if enabled, and gitPath not specified
        ...(sourceFiles.output ? DocletPage.sources(data().get(), opts, sourceFiles.path) : [])
    ]);
    
    // TODO: unique nav for each page (to highlight active link)
    let members = Object.assign(helper.getMembers(data), {tutorials: tutorials.children});
    view.nav = PublishUtils.buildNav(members, data);
    
    // Extract the main page title from the readme
    let readme = opts.readme && JSDOM.fragment(opts.readme),
        heading = (!readme ? "Home" : readme.removeChild(readme.querySelector("h1")).textContent);
    
    // Find the API entry doclet (if specified) and move it to the index
    if (!!conf.classy.apiEntry) {
        // Find the doclet and remove it from pages - it no longer gets its own page
        let entry = data({kind: DocletPage.types, longname: conf.classy.apiEntry}).first(),
            index = pages.indexOf(pages.find(p => p.doclet === entry)),
            page = (index >= 0 ? pages.splice(index, 1).pop() : false);
        
        if (!!page) {
            // Render and get the inner contents of the page that would have existed
            let content = JSDOM.fragment(JSDOM.fragment(page.render()).querySelector("main > section > header").innerHTML);
            
            // If there's no readme, now there is!
            if (!readme) readme = content;
            // Otherwise, add or replace the "API" section of the readme
            else {
                // See if we can find an "API" heading in the readme, and get the overview contents for insertion
                let sectionHeading = [...readme.querySelectorAll("h1, h2, h3, h4, h5, h6")].find(h => h.innerHTML === "API"),
                    sectionContent = content.querySelector(".container-overview");
                
                if (!!sectionHeading) {
                    // The "API" heading exists, mark it as such
                    sectionHeading.setAttribute("id", "api");
                    // See if there's any sections following it
                    let nextHeading = readme.querySelector("#api ~ h1, #api ~ h2, #api ~ h3, #api ~ h4, #api ~ h5, #api ~ h6");
                    for (let node of [...readme.querySelectorAll("#api ~ *")]) {
                        // Remove nodes between API heading and next heading (if any)
                        if (node === nextHeading) break;
                        else readme.removeChild(node);
                    }
                    
                    // Append the contents if nothing follows, or insert between sections
                    if (!nextHeading) readme.appendChild(sectionContent);
                    else readme.insertBefore(sectionContent, nextHeading);
                } else {
                    // Much simpler, there is no "API" section yet
                    readme.appendChild(sectionContent);
                }
            }
        }
    }
    
    // Index page displays information from package.json and lists files
    pages.unshift(...[
        ...(members.globals.length ? [new DocletPage({name: "Global", longname: globalUrl}, [{kind: "globalobj"}])] : []),
        new DocletPage({name: heading, longname: indexUrl}, [
            ...data({kind: "package"}).get(),
            ...[{kind: "mainpage", readme: [...readme?.children || []].map(n => n.outerHTML).join("\n"), longname: (opts.mainpagetitle) ? opts.mainpagetitle : "Main Page"}],
            ...data({kind: "file"}).get()
        ])
    ]);
    
    // Generate all the pages, then generate the tutorials!
    for (let page of pages) page.generate(helper.longnameToUrl[page.longname] ?? page.longname);
    PublishUtils.generateTutorials(tutorials);
};