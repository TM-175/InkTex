/**
 * The language registry — the single place a programming language is defined.
 *
 * Each entry maps one language onto the four vocabularies InkTex has to speak:
 *
 * | Field | Consumer |
 * |---|---|
 * | `extensions` | the backend indexer (passed as a whitelist) and detection |
 * | `monaco` | the embedded code editor's syntax highlighting |
 * | `minted` | the Pygments lexer name |
 * | `listings` | the `listings` package language name |
 *
 * `listings` ships with far fewer languages than Pygments — it has no Rust, Go,
 * TypeScript, JavaScript, Kotlin, Swift, JSON, YAML, CSS or Scala. For those,
 * `lstDefinition` carries a `\lstdefinelanguage` block that the preamble
 * manager adds, so choosing the `listings` engine is never a dead end.
 *
 * Definitions deliberately describe only *token classes* (keywords, comments,
 * strings). Colour comes from the theme's `\lstdefinestyle`, so the two
 * compose.
 */

export interface LanguageDefinition {
  /** Registry id, used everywhere internally. */
  id: string;
  label: string;
  /** Lowercase extensions, or exact filenames for extensionless files. */
  extensions: string[];
  /** Monaco language id, or `plaintext`. */
  monaco: string;
  /** Pygments lexer name for minted. */
  minted: string;
  /** `listings` language name, including any dialect prefix. */
  listings: string;
  /**
   * A `\lstdefinelanguage` block, when `listings` does not ship this language.
   * `listings` then refers to the name defined here.
   */
  lstDefinition?: string;
  /** Line-comment prefix, used by the region hint in the import dialog. */
  lineComment?: string;
}

/** Keyword lists are trimmed to what actually appears in student code. */
const RUST_DEFINITION = String.raw`\lstdefinelanguage{Rust}{
  keywords={as,async,await,break,const,continue,crate,dyn,else,enum,extern,false,fn,for,
    if,impl,in,let,loop,match,mod,move,mut,pub,ref,return,self,Self,static,struct,super,
    trait,true,type,unsafe,use,where,while},
  ndkeywords={bool,char,f32,f64,i8,i16,i32,i64,i128,isize,str,u8,u16,u32,u64,u128,usize,
    String,Vec,Option,Result,Box,Rc,Arc,HashMap,HashSet,Some,None,Ok,Err},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
}`;

const GO_DEFINITION = String.raw`\lstdefinelanguage{Go}{
  keywords={break,case,chan,const,continue,default,defer,else,fallthrough,for,func,go,
    goto,if,import,interface,map,package,range,return,select,struct,switch,type,var},
  ndkeywords={bool,byte,complex64,complex128,error,float32,float64,int,int8,int16,int32,
    int64,rune,string,uint,uint8,uint16,uint32,uint64,uintptr,true,false,iota,nil,make,
    new,len,cap,append,copy,delete,panic,recover},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]` + '`' + `,
}`;

const JAVASCRIPT_DEFINITION = String.raw`\lstdefinelanguage{JavaScript}{
  keywords={async,await,break,case,catch,class,const,continue,debugger,default,delete,do,
    else,export,extends,finally,for,function,if,import,in,instanceof,let,new,of,return,
    static,super,switch,this,throw,try,typeof,var,void,while,with,yield},
  ndkeywords={true,false,null,undefined,NaN,Infinity,Array,Object,String,Number,Boolean,
    Promise,Map,Set,Symbol,JSON,Math,console,document,window},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]',
  morestring=[b]` + '`' + `,
}`;

const TYPESCRIPT_DEFINITION = String.raw`\lstdefinelanguage{TypeScript}{
  keywords={abstract,any,as,async,await,break,case,catch,class,const,constructor,continue,
    declare,default,delete,do,else,enum,export,extends,finally,for,from,function,get,
    if,implements,import,in,instanceof,interface,is,keyof,let,namespace,new,of,private,
    protected,public,readonly,return,satisfies,set,static,super,switch,this,throw,try,
    type,typeof,var,void,while,yield},
  ndkeywords={true,false,null,undefined,never,unknown,string,number,boolean,object,symbol,
    bigint,Array,Promise,Record,Partial,Readonly,Map,Set,console},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]',
  morestring=[b]` + '`' + `,
}`;

const KOTLIN_DEFINITION = String.raw`\lstdefinelanguage{Kotlin}{
  keywords={abstract,actual,annotation,as,break,by,catch,class,companion,const,constructor,
    continue,crossinline,data,do,else,enum,expect,external,false,final,finally,for,fun,
    get,if,import,in,infix,init,inline,inner,interface,internal,is,lateinit,noinline,
    null,object,open,operator,out,override,package,private,protected,public,reified,
    return,sealed,set,super,suspend,this,throw,true,try,typealias,val,var,vararg,when,
    where,while},
  ndkeywords={Any,Array,Boolean,Byte,Char,Double,Float,Int,List,Long,Map,MutableList,
    MutableMap,Nothing,Number,Set,Short,String,Unit},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
}`;

const SWIFT_DEFINITION = String.raw`\lstdefinelanguage{Swift}{
  keywords={associatedtype,as,async,await,break,case,catch,class,continue,default,defer,
    deinit,do,else,enum,extension,fallthrough,false,fileprivate,for,func,guard,if,import,
    in,init,inout,internal,is,let,nil,open,operator,private,protocol,public,repeat,
    rethrows,return,self,Self,static,struct,subscript,super,switch,throw,throws,true,try,
    typealias,var,where,while},
  ndkeywords={Any,Array,Bool,Character,Dictionary,Double,Error,Float,Int,Optional,Result,
    Set,String,UInt,Void},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
}`;

const SCALA_DEFINITION = String.raw`\lstdefinelanguage{Scala}{
  keywords={abstract,case,catch,class,def,do,else,extends,false,final,finally,for,forSome,
    given,if,implicit,import,lazy,match,new,null,object,override,package,private,
    protected,return,sealed,super,this,throw,trait,try,true,type,using,val,var,while,
    with,yield},
  ndkeywords={Any,AnyRef,Boolean,Byte,Char,Double,Either,Float,Int,List,Long,Map,Nothing,
    Option,Seq,Set,Short,Some,String,Unit,Vector},
  sensitive=true,
  comment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
}`;

const JSON_DEFINITION = String.raw`\lstdefinelanguage{JSON}{
  keywords={true,false,null},
  sensitive=true,
  morestring=[b]",
}`;

const YAML_DEFINITION = String.raw`\lstdefinelanguage{YAML}{
  keywords={true,false,null,yes,no,on,off},
  sensitive=false,
  comment=[l]{\#},
  morestring=[b]",
  morestring=[b]',
}`;

const CSS_DEFINITION = String.raw`\lstdefinelanguage{CSS}{
  keywords={color,background,margin,padding,border,display,position,top,right,bottom,left,
    width,height,font,flex,grid,gap,align-items,justify-content,overflow,z-index},
  sensitive=false,
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]',
}`;

const MARKDOWN_DEFINITION = String.raw`\lstdefinelanguage{Markdown}{
  sensitive=false,
  morecomment=[l]{>},
  morestring=[b]` + '`' + `,
}`;

export const LANGUAGES: LanguageDefinition[] = [
  // --- The languages the brief names explicitly -----------------------------
  { id: 'c', label: 'C', extensions: ['c', 'h'], monaco: 'plaintext', minted: 'c', listings: 'C', lineComment: '//' },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], monaco: 'plaintext', minted: 'cpp', listings: 'C++', lineComment: '//' },
  { id: 'java', label: 'Java', extensions: ['java'], monaco: 'plaintext', minted: 'java', listings: 'Java', lineComment: '//' },
  { id: 'python', label: 'Python', extensions: ['py', 'pyw'], monaco: 'plaintext', minted: 'python', listings: 'Python', lineComment: '#' },
  { id: 'rust', label: 'Rust', extensions: ['rs'], monaco: 'plaintext', minted: 'rust', listings: 'Rust', lstDefinition: RUST_DEFINITION, lineComment: '//' },
  { id: 'go', label: 'Go', extensions: ['go'], monaco: 'plaintext', minted: 'go', listings: 'Go', lstDefinition: GO_DEFINITION, lineComment: '//' },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs', 'jsx'], monaco: 'plaintext', minted: 'javascript', listings: 'JavaScript', lstDefinition: JAVASCRIPT_DEFINITION, lineComment: '//' },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'tsx', 'mts'], monaco: 'plaintext', minted: 'typescript', listings: 'TypeScript', lstDefinition: TYPESCRIPT_DEFINITION, lineComment: '//' },
  { id: 'kotlin', label: 'Kotlin', extensions: ['kt', 'kts'], monaco: 'plaintext', minted: 'kotlin', listings: 'Kotlin', lstDefinition: KOTLIN_DEFINITION, lineComment: '//' },
  { id: 'swift', label: 'Swift', extensions: ['swift'], monaco: 'plaintext', minted: 'swift', listings: 'Swift', lstDefinition: SWIFT_DEFINITION, lineComment: '//' },
  { id: 'bash', label: 'Bash', extensions: ['sh', 'bash', 'zsh', 'fish'], monaco: 'shell', minted: 'bash', listings: 'bash', lineComment: '#' },
  { id: 'sql', label: 'SQL', extensions: ['sql'], monaco: 'plaintext', minted: 'sql', listings: 'SQL', lineComment: '--' },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], monaco: 'xml', minted: 'html', listings: 'HTML' },
  { id: 'css', label: 'CSS', extensions: ['css', 'scss', 'sass', 'less'], monaco: 'plaintext', minted: 'css', listings: 'CSS', lstDefinition: CSS_DEFINITION },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc'], monaco: 'plaintext', minted: 'json', listings: 'JSON', lstDefinition: JSON_DEFINITION },
  { id: 'yaml', label: 'YAML', extensions: ['yaml', 'yml'], monaco: 'yaml', minted: 'yaml', listings: 'YAML', lstDefinition: YAML_DEFINITION, lineComment: '#' },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown'], monaco: 'markdown', minted: 'markdown', listings: 'Markdown', lstDefinition: MARKDOWN_DEFINITION },

  // --- Others Pygments handles natively, offered for completeness ----------
  { id: 'csharp', label: 'C#', extensions: ['cs'], monaco: 'plaintext', minted: 'csharp', listings: '[Sharp]C', lineComment: '//' },
  { id: 'scala', label: 'Scala', extensions: ['scala', 'sc'], monaco: 'plaintext', minted: 'scala', listings: 'Scala', lstDefinition: SCALA_DEFINITION, lineComment: '//' },
  { id: 'ruby', label: 'Ruby', extensions: ['rb'], monaco: 'plaintext', minted: 'ruby', listings: 'Ruby', lineComment: '#' },
  { id: 'php', label: 'PHP', extensions: ['php'], monaco: 'plaintext', minted: 'php', listings: 'PHP', lineComment: '//' },
  { id: 'perl', label: 'Perl', extensions: ['pl', 'pm'], monaco: 'plaintext', minted: 'perl', listings: 'Perl', lineComment: '#' },
  { id: 'r', label: 'R', extensions: ['r'], monaco: 'plaintext', minted: 'r', listings: 'R', lineComment: '#' },
  { id: 'matlab', label: 'MATLAB', extensions: ['m'], monaco: 'plaintext', minted: 'matlab', listings: 'Matlab', lineComment: '%' },
  { id: 'lua', label: 'Lua', extensions: ['lua'], monaco: 'plaintext', minted: 'lua', listings: 'Lua', lineComment: '--' },
  { id: 'haskell', label: 'Haskell', extensions: ['hs'], monaco: 'plaintext', minted: 'haskell', listings: 'Haskell', lineComment: '--' },
  { id: 'fortran', label: 'Fortran', extensions: ['f90', 'f95', 'f03'], monaco: 'plaintext', minted: 'fortran', listings: 'Fortran', lineComment: '!' },
  { id: 'verilog', label: 'Verilog', extensions: ['v', 'sv'], monaco: 'plaintext', minted: 'verilog', listings: 'Verilog', lineComment: '//' },
  { id: 'vhdl', label: 'VHDL', extensions: ['vhd', 'vhdl'], monaco: 'plaintext', minted: 'vhdl', listings: 'VHDL', lineComment: '--' },
  { id: 'assembly', label: 'Assembly', extensions: ['asm', 's'], monaco: 'plaintext', minted: 'nasm', listings: '[x86masm]Assembler', lineComment: ';' },
  { id: 'xml', label: 'XML', extensions: ['xml', 'svg', 'xsl'], monaco: 'xml', minted: 'xml', listings: 'XML' },
  { id: 'makefile', label: 'Makefile', extensions: ['makefile', 'mk'], monaco: 'plaintext', minted: 'make', listings: 'make', lineComment: '#' },
  { id: 'dockerfile', label: 'Dockerfile', extensions: ['dockerfile'], monaco: 'plaintext', minted: 'docker', listings: 'bash', lineComment: '#' },
  { id: 'toml', label: 'TOML', extensions: ['toml'], monaco: 'plaintext', minted: 'toml', listings: 'YAML', lstDefinition: YAML_DEFINITION, lineComment: '#' },
  { id: 'latex', label: 'LaTeX', extensions: ['tex', 'sty', 'cls'], monaco: 'latex', minted: 'latex', listings: 'TeX', lineComment: '%' },
  { id: 'text', label: 'Plain text', extensions: ['txt', 'log'], monaco: 'plaintext', minted: 'text', listings: '' },
];

const BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]));

const BY_EXTENSION = new Map<string, LanguageDefinition>();
for (const language of LANGUAGES) {
  for (const extension of language.extensions) {
    // First registration wins, so `.m` stays MATLAB rather than Objective-C.
    if (!BY_EXTENSION.has(extension)) BY_EXTENSION.set(extension, language);
  }
}

export function languageById(id: string): LanguageDefinition | undefined {
  return BY_ID.get(id);
}

/** Resolve a language from a file path, by extension or exact name. */
export function languageForFile(path: string): LanguageDefinition | undefined {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;

  return BY_EXTENSION.get(extension) ?? BY_EXTENSION.get(name);
}

/** Every extension worth indexing — the whitelist handed to the backend. */
export function indexableExtensions(): string[] {
  const seen = new Set<string>();
  for (const language of LANGUAGES) {
    // `.tex` and `.log` are project documents, not code assets.
    if (language.id === 'latex' || language.id === 'text') continue;
    for (const extension of language.extensions) seen.add(extension);
  }
  return [...seen];
}

/** Display label for a language id, falling back to the id itself. */
export function languageLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Languages sorted for a picker: the common ones first, then alphabetical. */
export function languageOptions(): { value: string; label: string }[] {
  const common = [
    'python', 'java', 'c', 'cpp', 'javascript', 'typescript', 'rust', 'go',
  ];

  const isCommon = (id: string) => common.includes(id);
  const sorted = [...LANGUAGES].sort((a, b) => {
    if (isCommon(a.id) !== isCommon(b.id)) return isCommon(a.id) ? -1 : 1;
    if (isCommon(a.id)) return common.indexOf(a.id) - common.indexOf(b.id);
    return a.label.localeCompare(b.label);
  });

  return sorted.map((language) => ({ value: language.id, label: language.label }));
}
