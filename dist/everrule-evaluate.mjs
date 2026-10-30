#!/usr/bin/env node
// everrule-evaluate, bundled from packages/prevention-contract by scripts/build-action.ts. Apache-2.0 (LICENSE);
// includes zod under the MIT License (THIRD_PARTY_LICENSES). Never contacts EverRule or any other service.
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// packages/prevention-contract/src/cli.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { readdirSync, readFileSync as readFileSync3, writeFileSync as writeFileSync2, appendFileSync, existsSync as existsSync4, mkdtempSync, rmSync as rmSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirname2, join as join3 } from "node:path";

// packages/prevention-contract/src/evaluate.ts
import { createHash } from "node:crypto";

// packages/prevention-contract/src/reports.ts
import { realpathSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";
var REPORT_FORMAT = { "node-test": "junit", pytest: "junit", vitest: "jest-json", jest: "jest-json" };
function readCases(runner, text, testPath, cwd) {
  return REPORT_FORMAT[runner] === "junit" ? junitCases(runner, text, testPath) : jestJsonCases(text, testPath, cwd);
}
function summarizeCases(c) {
  const ran = c.cases.filter((x) => x.status !== "skipped");
  const failed = ran.filter((x) => x.status === "failed");
  const report = { found: c.found, executed: ran.length, failed: failed.length, failed_cases: failed.map((x) => x.name) };
  if (c.load_error !== void 0) report.load_error = c.load_error;
  if (c.other_files_failed) report.other_files_failed = true;
  return report;
}
var unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
var attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : void 0;
};
function junitCases(runner, xml, testPath) {
  if (!/<testsuites?[\s>]/.test(xml)) return null;
  const report = { found: true, cases: [] };
  const cases = xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g);
  for (const m of cases) {
    const open = m[1];
    const body = m[3] ?? "";
    const name = attr(open, "name") ?? "";
    const classname = attr(open, "classname");
    if (/<skipped\b/.test(body)) {
      report.cases.push({ name, status: "skipped" });
      continue;
    }
    const failure = /<failure\b([^>]*)/.exec(body);
    const error = /<error\b([^>]*)/.exec(body);
    if (runner === "node-test" && failure && normalize(name) === normalize(testPath) && attr(failure[1], "message") === "test failed") {
      report.load_error ??= "the test file failed before its tests ran (node:test reported the file itself as failed)";
      continue;
    }
    if (error) {
      report.load_error ??= attr(error[1], "message") ?? "error";
      continue;
    }
    const caseName = classname && runner === "pytest" ? `${classname}::${name}` : name;
    if (!failure) {
      report.cases.push({ name: caseName, status: "passed" });
      continue;
    }
    const text = /<failure\b[^>]*>([\s\S]*?)<\/failure>/.exec(body)?.[1] ?? "";
    report.cases.push({ name: caseName, status: "failed", message: [attr(failure[1], "message") ?? "", unescape(text).trim()].filter(Boolean).join("\n") });
  }
  return report;
}
function jestJsonCases(text, testPath, cwd) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.testResults)) return null;
  const want = real(resolve(cwd, testPath));
  const entry = data.testResults.find((t) => typeof t.name === "string" && real(resolve(cwd, t.name)) === want);
  if (!entry) return { found: false, cases: [] };
  const ran = (a) => a.status !== "pending" && a.status !== "skipped" && a.status !== "todo" && a.status !== "disabled";
  const cases = (entry.assertionResults ?? []).map((a) => ({
    name: a.fullName ?? a.title ?? "",
    path_name: [...a.ancestorTitles ?? [], a.title ?? ""].join(" > "),
    status: !ran(a) ? "skipped" : a.status === "failed" ? "failed" : "passed",
    ...a.status === "failed" ? { message: (a.failureMessages ?? [""])[0] ?? "" } : {}
  }));
  const report = { found: true, cases };
  if (entry.status === "failed" && !cases.some((c) => c.status === "failed")) report.load_error = (entry.message ?? "").split("\n")[0] || "the test file failed before its tests ran";
  if (data.testResults.some((t) => t !== entry && t.status === "failed")) report.other_files_failed = true;
  return report;
}
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
function reportFile(dir, contractId, runner) {
  const file = resolve(dir, `${contractId}.${REPORT_FORMAT[runner] === "junit" ? "xml" : "json"}`);
  const rel = relative(dir, file);
  if (isAbsolute(rel) || rel.startsWith("..")) throw new Error(`report path for ${contractId} leaves the report folder`);
  return file;
}

// packages/prevention-contract/src/runners.ts
function runnerCommand(runner, testPath, report) {
  switch (runner) {
    case "node-test":
      return { cmd: "node", args: ["--import", "tsx", "--test", ...report ? ["--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=junit", `--test-reporter-destination=${report}`] : [], testPath] };
    case "vitest":
      return { cmd: "vitest", bin: true, args: ["run", testPath, ...report ? ["--reporter=default", "--reporter=json", `--outputFile.json=${report}`] : []] };
    case "jest":
      return { cmd: "jest", bin: true, args: ["--runTestsByPath", testPath, ...report ? ["--json", `--outputFile=${report}`] : []] };
    case "pytest":
      return { cmd: "python", args: ["-m", "pytest", testPath, ...report ? [`--junitxml=${report}`] : []] };
    default: {
      const never = runner;
      throw new Error(`unknown runner ${String(never)}`);
    }
  }
}

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path: path2, errorMaps, issueData } = params;
  const fullPath = [...path2, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path2, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path2;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg2) => {
        addIssueToContext(ctx, arg2);
        if (arg2.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg2) => ZodString.create({ ...arg2, coerce: true })),
  number: ((arg2) => ZodNumber.create({ ...arg2, coerce: true })),
  boolean: ((arg2) => ZodBoolean.create({
    ...arg2,
    coerce: true
  })),
  bigint: ((arg2) => ZodBigInt.create({ ...arg2, coerce: true })),
  date: ((arg2) => ZodDate.create({ ...arg2, coerce: true }))
};
var NEVER = INVALID;

// packages/prevention-contract/src/schema.ts
var Sha256 = external_exports.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase hex SHA-256");
var GitSha = external_exports.string().regex(/^[0-9a-f]{7,40}$/, "must be a git commit SHA");
var ISO_ZONED = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
function isZonedTimestamp(v) {
  const m = ISO_ZONED.exec(v);
  if (!m || Number.isNaN(Date.parse(v))) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}
var Timestamp = external_exports.string().refine(isZonedTimestamp, "must be an ISO 8601 date and time with a zone, such as 2026-10-04T00:00:00Z");
var ContractId = external_exports.string().regex(/^ER-[A-Z]+-\d{3,}$/, "must be a contract id such as ER-INC-482");
var CONTRACT_SCHEMA = "everrule-contract/v1";
var HASH_ALGORITHMS = ["sha256"];
var MAX_ADVISORY_DAYS = 14;
var DAY_MS = 24 * 60 * 60 * 1e3;
var FailureClass = external_exports.enum([
  "duplicate_side_effect",
  // retry or replay created a second charge, order, ledger entry
  "authorization_boundary",
  // an action proceeded without the approval or role it required
  "cross_tenant_access",
  // data or an action crossed a tenant boundary
  "threshold_approval",
  // a consequential action above a limit executed without approval
  "state_transition",
  // an invalid transition (refund after settlement, cancel after ship)
  "ordering_failure",
  // events processed out of order produced a wrong state
  "stale_state",
  // a decision used state that was no longer current
  "webhook_replay",
  // the same external event produced two effects
  "partial_transaction",
  // one of several writes committed without the others
  "schema_assumption",
  // code assumed a field, shape or nullability that did not hold
  "migration_incompatibility",
  // a migration broke a running version or a rollback path
  "other"
]);
var Runner = external_exports.enum(["node-test", "vitest", "jest", "pytest"]);
var Verification = external_exports.discriminatedUnion("mode", [
  external_exports.object({
    mode: external_exports.literal("exact"),
    broken_revision: external_exports.string().min(7),
    broken_result: external_exports.literal("fail"),
    fixed_revision: external_exports.string().min(7),
    fixed_result: external_exports.literal("pass"),
    verified_at: external_exports.string(),
    /** Sprint 03 (1a.2): what was proven, by digest. Optional, so contracts without them keep their hash. */
    case_set_digest: external_exports.string().optional(),
    binding_set_digest: external_exports.string().optional(),
    intent_digest: external_exports.string().optional(),
    candidate_digest: external_exports.string().optional(),
    verification_protocol_version: external_exports.string().optional()
  }).strict(),
  external_exports.object({
    mode: external_exports.literal("effect_boundary"),
    limitation: external_exports.string().min(1),
    fixed_revision: external_exports.string().min(7).optional(),
    verified_at: external_exports.string()
  }).strict(),
  /** Team-written contracts only: a rule not proven against a failing commit, with the team's written basis. Never shown as proven. */
  external_exports.object({
    mode: external_exports.literal("asserted"),
    basis: external_exports.string().min(1),
    verified_at: external_exports.string()
  }).strict()
]);
var LoopholeResult = external_exports.object({
  id: external_exports.string(),
  title: external_exports.string(),
  result: external_exports.enum(["holds", "loophole", "owner_decides"]),
  note: external_exports.string().optional()
}).strict();
var Approval = external_exports.object({
  status: external_exports.enum(["draft", "approved", "rejected", "retired"]),
  approver_name: external_exports.string().optional(),
  approver_role: external_exports.string().optional(),
  approved_at: Timestamp.optional(),
  rationale: external_exports.string().optional(),
  /** SHA-256 of the canonical contract without this block; an edit changes it and voids the approval. */
  contract_hash: Sha256.optional(),
  /** With status retired only: the contract that replaces this one. */
  superseded_by: ContractId.optional()
}).strict();
var Incident = external_exports.object({
  id: external_exports.string().min(1),
  title: external_exports.string().min(1),
  occurred_at: external_exports.string().optional(),
  severity: external_exports.string().optional(),
  /** Link or path to the incident report. Replaces postmortem_ref, which is still read. */
  report_ref: external_exports.string().optional(),
  fix_pr: external_exports.string().url().optional()
}).strict();
var IncidentOnRead = external_exports.preprocess((raw, ctx) => {
  if (!raw || typeof raw !== "object" || !("postmortem_ref" in raw)) return raw;
  const { postmortem_ref, ...rest } = raw;
  if (rest["report_ref"] !== void 0 && rest["report_ref"] !== postmortem_ref) {
    ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["report_ref"], message: "report_ref and postmortem_ref disagree; keep report_ref only" });
    return rest;
  }
  return { ...rest, report_ref: postmortem_ref };
}, Incident);
var Ident = external_exports.string().regex(/^[a-z][a-z0-9_]*$/, "must be a lower_snake_case name");
var Dotted = external_exports.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, "must be a dotted name such as payments.process");
var BehaviorBlock = external_exports.object({
  profile: external_exports.object({ id: external_exports.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/), version: external_exports.number().int().positive() }).strict(),
  operation: Dotted,
  inputs: external_exports.object({ request_type: Ident, identity_type: Ident }).strict(),
  preconditions: external_exports.object({ request_is_valid: external_exports.boolean(), initial_successful_effect_count: external_exports.number().int().nonnegative() }).strict(),
  observation: external_exports.object({ concept: Dotted, measure: Ident, correlation: Ident }).strict(),
  expectations: external_exports.object({
    after_first_invocation: external_exports.number().int().nonnegative(),
    after_repeat_invocation: external_exports.number().int().nonnegative(),
    first_outcome: Ident,
    repeat_outcome: Ident
  }).strict(),
  execution: external_exports.object({ ordering: Ident, completion: Ident, isolation: Ident, effects_visibility: Ident, side_effect_environment: Ident }).strict()
}).strict();
var PreventionContract = external_exports.object({
  /** Editor metadata (a JSON Schema URL); not part of the rule, so not in the contract hash. */
  $schema: external_exports.string().optional(),
  schema: external_exports.literal(CONTRACT_SCHEMA, { errorMap: () => ({ message: `unknown contract schema; this evaluator reads ${CONTRACT_SCHEMA}` }) }).optional(),
  /** The algorithm behind approval.contract_hash and test.sha256; absent means sha256. */
  hash_algorithm: external_exports.enum(HASH_ALGORITHMS, { errorMap: () => ({ message: `unknown hash_algorithm; this evaluator knows ${HASH_ALGORITHMS.join(", ")}` }) }).optional(),
  id: ContractId,
  version: external_exports.number().int().positive().default(1),
  /**
   * incident: derived from an incident and its fix (the default when absent). team: written by the
   * team with no incident behind it. Absent stays absent when parsed, so the contract hash of every
   * contract written before this field existed is unchanged.
   */
  origin: external_exports.enum(["incident", "team"]).optional(),
  /** Required for incident contracts; team-written contracts may omit it. */
  incident: IncidentOnRead.optional(),
  failure_class: FailureClass,
  behavior: BehaviorBlock.optional(),
  requirement: external_exports.object({
    statement: external_exports.string().min(1),
    assumptions: external_exports.array(external_exports.string()).default([])
  }).strict(),
  scope: external_exports.object({
    paths: external_exports.array(external_exports.string().min(1)).min(1),
    dependencies: external_exports.array(external_exports.string()).default([])
  }).strict(),
  test: external_exports.object({
    /** Relative to the repository root (or the service folder), never absolute, never climbing out with "..". */
    path: external_exports.string().min(1).refine((p) => !/^([a-zA-Z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes(".."), "must be a relative path inside the repository"),
    runner: Runner,
    required: external_exports.literal(true),
    /** SHA-256 of the test file (see testFileHash). Inside the contract hash, so weakening the test voids the approval. */
    sha256: Sha256.optional()
  }).strict(),
  /** Burn-in: until advisory_until, failures are warnings. At most MAX_ADVISORY_DAYS after approval. */
  enforcement: external_exports.object({ advisory_until: Timestamp.optional() }).strict().optional(),
  /** On drafts: the fix PR's base and merge commits that verify mode runs the test at. */
  verification_target: external_exports.object({ base: GitSha, merge: GitSha }).strict().optional(),
  /** What verification showed. A draft may not have one yet; an approved contract must. */
  verification: Verification.optional(),
  loopholes: external_exports.array(LoopholeResult).default([]),
  approval: Approval,
  ownership: external_exports.object({
    accountable_team: external_exports.string().optional(),
    review_due: external_exports.string().optional()
  }).strict().default({})
}).strict().superRefine((c, ctx) => {
  if (c.approval.superseded_by !== void 0 && c.approval.status !== "retired") ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["approval", "superseded_by"], message: "only with status retired" });
  if (c.approval.superseded_by === c.id) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["approval", "superseded_by"], message: "a contract cannot supersede itself" });
  if (originOf(c) === "incident" && !c.incident) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["incident"], message: "required when origin is incident (the default)" });
  if (c.verification?.mode === "asserted" && originOf(c) !== "team") ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["verification", "mode"], message: "asserted is only for team-written contracts (origin: team); an incident contract is proven against its failing commit" });
  const until = c.enforcement?.advisory_until;
  const approvedAt = c.approval.approved_at;
  if (until && approvedAt && isZonedTimestamp(until) && isZonedTimestamp(approvedAt)) {
    const days = (Date.parse(until) - Date.parse(approvedAt)) / DAY_MS;
    if (days > MAX_ADVISORY_DAYS) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["enforcement", "advisory_until"], message: `must be at most ${MAX_ADVISORY_DAYS} days after approval.approved_at` });
    if (days < 0) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["enforcement", "advisory_until"], message: "must not be before approval.approved_at" });
  }
  if (c.approval.status !== "approved") return;
  for (const field2 of ["approver_name", "approver_role", "approved_at", "contract_hash"]) {
    if (!c.approval[field2]) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["approval", field2], message: "required when status is approved" });
  }
  if (!c.test.sha256) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["test", "sha256"], message: "required when status is approved" });
  if (!c.verification) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["verification"], message: "required when status is approved" });
});
function originOf(c) {
  return c.origin ?? "incident";
}
var InfraSubtype = external_exports.enum(["RUNNER_CRASH", "DEPENDENCY_OR_SETUP", "TIMEOUT", "NO_REPORT"]);
var ContractResult = external_exports.object({
  id: external_exports.string(),
  version: external_exports.number().int().positive(),
  /** contractHash of the contract as evaluated; equal to approved_hash whenever the test ran. */
  contract_hash: Sha256,
  /** approval.contract_hash as committed. */
  approved_hash: Sha256,
  /** test.sha256 as committed; the file matched it, or the test would not have run. */
  test_hash: Sha256,
  hash_algorithm: external_exports.enum(HASH_ALGORITHMS),
  test: external_exports.string(),
  runner: Runner,
  /**
   * PASS: the report shows the file's tests ran and none failed. BEHAVIOR_FAIL: the report shows the
   * file ran and a test case failed. INFRA_ERROR: anything else; when unsure, this, never BEHAVIOR_FAIL.
   */
  result: external_exports.enum(["PASS", "BEHAVIOR_FAIL", "INFRA_ERROR"]),
  subtype: InfraSubtype.optional(),
  detail: external_exports.string(),
  /** null when the process never started or was killed. */
  exit_code: external_exports.number().int().nullable(),
  tests_executed: external_exports.number().int().nonnegative(),
  tests_failed: external_exports.number().int().nonnegative(),
  failed_cases: external_exports.array(external_exports.string()).max(20),
  matched_paths: external_exports.array(external_exports.string()),
  duration_ms: external_exports.number().nonnegative(),
  /** Inside the contract's burn-in: a failure is reported as a warning and does not fail the run. */
  advisory_until: external_exports.string().optional()
}).strict();
var IntegrityProblem = external_exports.object({
  id: external_exports.string(),
  problem: external_exports.enum(["contract_hash_mismatch", "test_hash_mismatch", "test_missing", "removed_without_retiring", "base_unreadable"]),
  detail: external_exports.string()
}).strict();
var BACKLOG_SCHEMA = "everrule-backlog/v1";
var IncidentKey = external_exports.string().regex(/^[A-Z][A-Z0-9]{1,15}-\d{1,9}$/, "must be an incident key such as INC-482");
var BACKLOG_REASON_CODES = ["NON_DETERMINISTIC_EXTERNAL", "NOT_EXPRESSIBLE_AS_TEST", "CONFIG_OR_INFRA_ONLY", "FIX_NOT_IN_REPO", "UNSUPPORTED_RUNNER", "OTHER"];
var BACKLOG_REASON_MAX = 200;
var BacklogIncident = external_exports.object({
  key: IncidentKey,
  eligibility: external_exports.enum(["PENDING_REVIEW", "ELIGIBLE", "UNSUITABLE", "SUPERSEDED"]),
  reason_code: external_exports.enum(BACKLOG_REASON_CODES).optional(),
  reason: external_exports.string().min(1).max(BACKLOG_REASON_MAX).optional(),
  /** The fix pull request's number in this repository; absent when the fix is elsewhere. */
  fix_pr: external_exports.number().int().positive().optional(),
  contract: ContractId.optional(),
  superseded_by: IncidentKey.optional(),
  updated_at: Timestamp
}).strict().superRefine((r, ctx) => {
  const issue = (path2, message) => ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: [path2], message });
  if (r.eligibility === "UNSUITABLE") {
    if (!r.reason_code) issue("reason_code", "required when eligibility is UNSUITABLE");
    if (!r.reason) issue("reason", "required when eligibility is UNSUITABLE");
  } else if (r.reason_code) issue("reason_code", "only with eligibility UNSUITABLE");
  if (r.eligibility === "SUPERSEDED" && !r.superseded_by) issue("superseded_by", "required when eligibility is SUPERSEDED");
  if (r.eligibility !== "SUPERSEDED" && r.superseded_by) issue("superseded_by", "only with eligibility SUPERSEDED");
  if (r.superseded_by === r.key) issue("superseded_by", "an incident cannot supersede itself");
});
var BacklogFile = external_exports.object({
  schema: external_exports.literal(BACKLOG_SCHEMA, { errorMap: () => ({ message: `unknown backlog schema; this evaluator reads ${BACKLOG_SCHEMA}` }) }),
  incidents: external_exports.array(BacklogIncident)
}).strict().superRefine((f, ctx) => {
  const seen = /* @__PURE__ */ new Set();
  f.incidents.forEach((r, i) => {
    if (seen.has(r.key)) ctx.addIssue({ code: external_exports.ZodIssueCode.custom, path: ["incidents", i, "key"], message: "listed twice" });
    seen.add(r.key);
  });
});
var BacklogCheck = external_exports.object({
  status: external_exports.enum(["absent", "valid", "invalid"]),
  /** At most 20; each names the field, never the value. */
  problems: external_exports.array(external_exports.string()).max(20)
}).strict();
var EVALUATION_SCHEMA = "everrule-evaluation/v1";
var EVALUATOR_VERSION = "1.1.0";
var EvaluationEvent = external_exports.object({
  name: external_exports.string().min(1),
  pull_request: external_exports.number().int().positive().nullable(),
  pr_labels: external_exports.array(external_exports.string()),
  base_sha: GitSha.nullable(),
  head_sha: GitSha.nullable(),
  merge_group: external_exports.object({ base_ref: external_exports.string(), head_ref: external_exports.string() }).strict().nullable()
}).strict();
var EvaluationRecord = external_exports.object({
  schema: external_exports.literal(EVALUATION_SCHEMA),
  evaluator_version: external_exports.string().min(1),
  /** null for a run outside GitHub Actions (no event file). */
  event: EvaluationEvent.nullable(),
  evaluated_at: external_exports.string(),
  changed_files: external_exports.array(external_exports.string()),
  applicable: external_exports.array(ContractResult),
  not_applicable: external_exports.array(external_exports.string()),
  skipped_unapproved: external_exports.array(external_exports.string()),
  /** Enforcement-integrity problems. Any one fails the run with exit 2, whatever the change touched. */
  integrity: external_exports.array(IntegrityProblem),
  /** Applicable contracts that failed inside their burn-in; reported, not failing. */
  warnings: external_exports.array(external_exports.string()),
  /** .everrule/backlog.json, validated when present. Never affects status or the exit code. */
  backlog: BacklogCheck,
  /** In order of precedence: integrity_fail (exit 2), infra_error (3), behavior_fail (1), then pass or no_applicable_contracts (0). */
  status: external_exports.enum(["pass", "behavior_fail", "infra_error", "integrity_fail", "no_applicable_contracts"])
}).strict();
var VERIFICATION_SCHEMA = "everrule-verification/v1";
var VerificationResult = external_exports.object({
  id: external_exports.string(),
  test: external_exports.string(),
  runner: Runner,
  /** package: .everrule/verify/<id>/ held EverRule's session and manifest. contract: built from the draft alone. */
  session_source: external_exports.enum(["package", "contract"]),
  evidence: external_exports.record(external_exports.unknown()),
  outcome: external_exports.enum(["exact", "flaky", "not_exact"]),
  detail: external_exports.string()
}).strict();
var VerificationReport = external_exports.object({
  schema: external_exports.literal(VERIFICATION_SCHEMA),
  generated_at: external_exports.string(),
  results: external_exports.array(VerificationResult),
  /** Drafts without a verification_target, which verify mode cannot run. */
  skipped: external_exports.array(external_exports.string()),
  /** Drafts the protocol could not run for (exit 3): nothing about their behavior is known. */
  errors: external_exports.array(external_exports.object({ id: external_exports.string(), detail: external_exports.string() }).strict()),
  status: external_exports.enum(["exact", "not_exact", "nothing_to_verify", "error"])
}).strict();

// packages/prevention-contract/src/evaluate.ts
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}
function matchesScope(contract, changedFiles) {
  const patterns = contract.scope.paths.map(globToRegExp);
  return changedFiles.filter((f) => patterns.some((p) => p.test(f)));
}
function checkIntegrity(input) {
  const problems = [];
  for (const c of input.contracts) {
    if (c.approval.status !== "approved") continue;
    const expected = contractHash(c);
    if (c.approval.contract_hash !== expected) {
      problems.push({ id: c.id, problem: "contract_hash_mismatch", detail: `approval.contract_hash ${short(c.approval.contract_hash)} does not match the contract (${short(expected)}). It was edited after approval; re-approve it to restore enforcement.` });
    }
    const source = input.readTest(c.test.path);
    if (source === null) {
      problems.push({ id: c.id, problem: "test_missing", detail: `the test file ${c.test.path} does not exist.` });
    } else if (testFileHash(source) !== c.test.sha256) {
      problems.push({ id: c.id, problem: "test_hash_mismatch", detail: `${c.test.path} changed after approval (test.sha256 ${short(c.test.sha256)}, file ${short(testFileHash(source))}). Re-approve the contract with the new test.` });
    }
  }
  if (input.baseError) problems.push({ id: "*", problem: "base_unreadable", detail: `could not read the base branch's contracts: ${input.baseError}` });
  for (const b of input.base ?? []) {
    if (b.status !== "approved") continue;
    const head = input.contracts.find((c) => c.id === b.id);
    if (!head) problems.push({ id: b.id, problem: "removed_without_retiring", detail: "approved on the base branch and missing here. Set approval.status to retired instead of deleting the contract." });
    else if (head.approval.status !== "approved" && head.approval.status !== "retired") problems.push({ id: b.id, problem: "removed_without_retiring", detail: `approved on the base branch and now ${head.approval.status}. Retire it, or keep it approved.` });
  }
  return problems;
}
var short = (h) => h ? h.slice(0, 12) : "missing";
function plan(contracts, changedFiles, integrity = []) {
  const runs = [];
  const notApplicable = [];
  const skippedUnapproved = [];
  const untrusted = new Set(integrity.map((p) => p.id));
  for (const c of contracts) {
    if (c.approval.status !== "approved") {
      if (c.approval.status !== "retired") skippedUnapproved.push(c.id);
      continue;
    }
    if (untrusted.has(c.id)) continue;
    const matched = matchesScope(c, changedFiles);
    if (matched.length === 0) notApplicable.push(c.id);
    else runs.push({ contract: c, matched_paths: matched });
  }
  return { runs, notApplicable, skippedUnapproved, integrity };
}
function classifyRun(run2, report, reportState, testPath) {
  const none = { tests_executed: 0, tests_failed: 0, failed_cases: [] };
  const infra = (subtype, detail, r) => ({ result: "INFRA_ERROR", subtype, detail, ...r ? counts(r) : none });
  if (run2.timed_out) return infra("TIMEOUT", `the test did not finish within the time limit and was stopped.`, report ?? void 0);
  if (run2.spawn_error) return infra("RUNNER_CRASH", run2.spawn_error);
  if (reportState === "missing" || !report) return infra("NO_REPORT", reportState === "unreadable" ? "the runner's report could not be read." : `the runner wrote no report (exit ${run2.exit_code ?? run2.signal}).`);
  if (!report.found) return infra("NO_REPORT", `the runner's report does not include ${testPath}.`);
  if (report.failed > 0 && run2.exit_code !== 0 && run2.exit_code !== null) return { result: "BEHAVIOR_FAIL", detail: `${report.failed} of ${report.executed} test cases failed.`, ...counts(report) };
  if (report.load_error) return infra("DEPENDENCY_OR_SETUP", `${testPath} could not load or set up: ${report.load_error}`, report);
  if (report.executed === 0) return infra("NO_REPORT", `the report shows no test in ${testPath} ran.`, report);
  if (report.failed === 0 && run2.exit_code === 0) return { result: "PASS", detail: `${report.executed} test cases passed.`, ...counts(report) };
  if (report.failed === 0 && report.other_files_failed && run2.exit_code !== null) return { result: "PASS", detail: `${report.executed} test cases passed. Other files the runner also matched failed; they are not this contract's test.`, ...counts(report) };
  return infra("RUNNER_CRASH", report.failed > 0 ? `the report shows failures but the runner exited ${run2.exit_code ?? run2.signal}.` : `every test case passed but the runner exited ${run2.exit_code ?? run2.signal}.`, report);
}
var counts = (r) => ({ tests_executed: r.executed, tests_failed: r.failed, failed_cases: r.failed_cases.slice(0, 20) });
function backlogProblem(i) {
  switch (i.code) {
    case "custom":
      return i.message;
    case "invalid_type":
      return "wrong type or missing";
    case "invalid_enum_value":
    case "invalid_literal":
      return "not an allowed value";
    case "unrecognized_keys":
      return "unknown key";
    case "invalid_string":
      return "invalid format";
    case "too_small":
      return "too short or too small";
    case "too_big":
      return "too long or too large";
    default:
      return "invalid";
  }
}
function checkBacklog(text) {
  if (text === null) return { status: "absent", problems: [] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: "invalid", problems: ["backlog.json is not valid JSON"] };
  }
  const r = BacklogFile.safeParse(raw);
  if (r.success) return { status: "valid", problems: [] };
  return { status: "invalid", problems: r.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(top level)"}: ${backlogProblem(i)}`) };
}
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1e3;
async function execute(planned, changedFiles, exec, opts) {
  const at = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  const applicable = [];
  for (const r of planned.runs) {
    const c = r.contract;
    const report = reportFile(opts.reportDir, c.id, c.test.runner);
    const { cmd, args, bin } = runnerCommand(c.test.runner, c.test.path, report);
    let run2;
    try {
      run2 = await exec(cmd, args, { bin: !!bin, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    } catch (e) {
      run2 = { exit_code: null, signal: null, timed_out: false, spawn_error: e instanceof Error ? e.message : String(e), duration_ms: 0 };
    }
    const text = opts.readFile(report);
    const cases = text === null ? null : readCases(c.test.runner, text, c.test.path, opts.cwd);
    const parsed = cases && summarizeCases(cases);
    const classified = classifyRun(run2, parsed, text === null ? "missing" : parsed ? "read" : "unreadable", c.test.path);
    if (classified.result === "BEHAVIOR_FAIL") opts.onFailure?.(c.id, (cases?.cases ?? []).filter((x) => x.status === "failed" && x.message).map((x) => x.message));
    const until = c.enforcement?.advisory_until;
    const inBurnIn = until !== void 0 && at.getTime() < Date.parse(until);
    applicable.push({ id: c.id, version: c.version, contract_hash: contractHash(c), approved_hash: c.approval.contract_hash, test_hash: c.test.sha256, hash_algorithm: c.hash_algorithm ?? "sha256", test: c.test.path, runner: c.test.runner, ...classified, exit_code: run2.exit_code, matched_paths: r.matched_paths, duration_ms: run2.duration_ms, ...inBurnIn ? { advisory_until: until } : {} });
  }
  const warnings = applicable.filter((a) => a.result !== "PASS" && a.advisory_until).map((a) => a.id);
  const failing = applicable.filter((a) => a.result !== "PASS" && !a.advisory_until);
  const status = planned.integrity.length > 0 ? "integrity_fail" : failing.some((a) => a.result === "INFRA_ERROR") ? "infra_error" : failing.length > 0 ? "behavior_fail" : applicable.length === 0 ? "no_applicable_contracts" : "pass";
  return { schema: EVALUATION_SCHEMA, evaluator_version: EVALUATOR_VERSION, event: opts.event ?? null, evaluated_at: at.toISOString(), changed_files: changedFiles, applicable, not_applicable: planned.notApplicable, skipped_unapproved: planned.skippedUnapproved, integrity: planned.integrity, warnings, backlog: opts.backlog ?? { status: "absent", problems: [] }, status };
}
function eventFrom(name, payload) {
  const none = { name, pull_request: null, pr_labels: [], base_sha: null, head_sha: null, merge_group: null };
  if (name === "pull_request" || name === "pull_request_target") {
    const pr = field(payload, "pull_request");
    if (!pr) throw new Error(`the ${name} event payload has no pull_request object`);
    const labels = pr["labels"];
    if (!Array.isArray(labels) || !labels.every((l) => typeof l?.name === "string")) throw new Error(`the ${name} event payload's pull_request.labels could not be read`);
    return EvaluationEvent.parse({ ...none, pull_request: pr["number"], pr_labels: labels.map((l) => l.name), base_sha: field(pr, "base")?.["sha"] ?? null, head_sha: field(pr, "head")?.["sha"] ?? null });
  }
  if (name === "merge_group") {
    const mg = field(payload, "merge_group");
    if (!mg) throw new Error("the merge_group event payload has no merge_group object");
    return EvaluationEvent.parse({ ...none, base_sha: mg["base_sha"] ?? null, head_sha: mg["head_sha"] ?? null, merge_group: { base_ref: mg["base_ref"], head_ref: mg["head_ref"] } });
  }
  return none;
}
function field(v, key) {
  const x = v && typeof v === "object" ? v[key] : void 0;
  return x && typeof x === "object" && !Array.isArray(x) ? x : void 0;
}
function exitCodeFor(record) {
  switch (record.status) {
    case "integrity_fail":
      return 2;
    case "infra_error":
      return 3;
    case "behavior_fail":
      return 1;
    default:
      return 0;
  }
}
function summarize(record, contracts) {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const lines = [];
  const head = record.status === "pass" ? "EverRule: every applicable prevention contract passed" : record.status === "behavior_fail" ? "EverRule: a prevention contract failed" : record.status === "infra_error" ? "EverRule: a prevention contract's test could not run" : record.status === "integrity_fail" ? "EverRule: a prevention contract was changed without approval" : "EverRule: no prevention contract applies to this change";
  lines.push(`## ${head}`, "");
  for (const a of record.applicable) {
    const c = byId.get(a.id);
    const word = a.result === "PASS" ? "PASS" : a.result === "BEHAVIOR_FAIL" ? "FAIL" : `COULD NOT RUN (${a.subtype})`;
    const label = a.result !== "PASS" && a.advisory_until ? `${word} (warning: burn-in until ${a.advisory_until.slice(0, 10)})` : word;
    lines.push(`- **${a.id}** ${label}: ${c?.requirement.statement ?? ""}`);
    const source = c && originOf(c) === "team" ? "team-written" : `incident ${c?.incident?.id ?? "?"}`;
    lines.push(`  - ${source}; test \`${a.test}\` (${a.runner}); touched ${a.matched_paths.join(", ")}`);
    const v = c?.verification;
    if (v?.mode === "exact") lines.push(`  - verified: fails at ${v.broken_revision.slice(0, 7)}, passes at ${v.fixed_revision.slice(0, 7)}`);
    else if (v?.mode === "effect_boundary") lines.push(`  - verification: effect-boundary reproduction; ${v.limitation}`);
    else if (v?.mode === "asserted") lines.push(`  - not proven against a failure; the team's basis: ${v.basis}`);
    if (a.result !== "PASS") lines.push(`  - ${a.detail}${a.failed_cases.length ? ` Failed: ${a.failed_cases.join("; ")}.` : ""}`);
  }
  if (record.not_applicable.length) lines.push("", `Not applicable to this change: ${record.not_applicable.join(", ")}.`);
  if (record.integrity.length) {
    lines.push("", "Changed without approval:");
    for (const p of record.integrity) lines.push(`- **${p.id}**: ${p.detail}`);
  }
  if (record.skipped_unapproved.length) lines.push("", `Drafts not enforced (unapproved): ${record.skipped_unapproved.join(", ")}.`);
  if (record.backlog.status === "invalid") lines.push("", `Warning: .everrule/backlog.json is invalid, so coverage cannot be read from it (this does not fail the check): ${record.backlog.problems.join("; ")}.`);
  lines.push("", "EverRule's service was not required to produce this result; the contracts and tests live in this repository.");
  return lines.join("\n");
}
function testFileHash(contents) {
  return createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex");
}
function approvalHashes(raw, testSource) {
  const r = raw ?? {};
  const test_sha256 = testFileHash(testSource);
  const draft = PreventionContract.parse({ ...r, test: { ...r.test, sha256: test_sha256 }, approval: { status: "draft" } });
  return { test_sha256, contract_hash: contractHash(draft) };
}
function contractHash(contract) {
  const { approval: _ignored, $schema: _editor, ...rest } = contract;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// packages/prevention-contract/src/run.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolve2 } from "node:path";
function localBin(name, cwd) {
  const file = process.platform === "win32" ? `${name}.cmd` : name;
  for (let dir = resolve2(cwd); ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", ".bin", file);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}
var KILL_GRACE_MS = 5e3;
function execIn(cwd) {
  return (cmd, args, opts) => new Promise((done) => {
    const started = Date.now();
    const finish = (o) => done({ ...o, duration_ms: Date.now() - started });
    const resolved = opts.bin ? localBin(cmd, cwd) : cmd;
    if (!resolved) return finish({ exit_code: null, signal: null, timed_out: false, spawn_error: `${cmd} is not installed in this repository (no node_modules/.bin/${cmd} from ${cwd} upward). EverRule runs the repository's own runner and never downloads one.` });
    const { NODE_TEST_CONTEXT: _ctx, ...env } = process.env;
    const group = process.platform !== "win32";
    const child = spawn(resolved, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32", detached: group });
    let timedOut = false;
    let settled = false;
    const kill = (signal) => {
      try {
        if (group && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      setTimeout(() => kill("SIGKILL"), KILL_GRACE_MS).unref();
    }, opts.timeoutMs);
    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish({ exit_code: null, signal: null, timed_out: false, spawn_error: `${cmd} could not start: ${e.message}` });
    });
    child.on("close", (code2, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish({ exit_code: code2, signal: signal ?? null, timed_out: timedOut });
    });
  });
}

// packages/prevention-contract/src/verify/drafts.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { existsSync as existsSync3, readFileSync as readFileSync2 } from "node:fs";
import { join as join2 } from "node:path";

// packages/prevention-contract/src/verify/protocol.ts
import { spawnSync } from "node:child_process";
import { createHash as createHash2, randomUUID } from "node:crypto";
import { existsSync as existsSync2, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
var VERIFICATION_PROTOCOL = "historical-sequential-v2";
var FIXED_RUNS = 3;
var BROKEN_RUNS = 1;
var LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "requirements.txt"];
var ProtocolError = class extends Error {
};
var digestOf = (b) => `sha256:${createHash2("sha256").update(b).digest("hex")}`;
var escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new ProtocolError(`git ${args.join(" ")}: ${(r.stderr || "failed").trim()}`);
  return r.stdout.trim();
}
function childEnv() {
  const { NODE_TEST_CONTEXT: _ctx, ...env } = process.env;
  return env;
}
function runProtocol(input) {
  const { session, manifest } = input;
  if (digestOf(input.candidate) !== manifest.artifact.digest) throw new ProtocolError("the candidate bytes do not match the manifest");
  if (digestOf(input.candidate) !== session.candidate_artifact_digest) throw new ProtocolError("the candidate bytes do not match the session");
  const adopted = manifest.artifact.adopted_test?.test_name ?? null;
  if (adopted && input.runner !== "vitest" && input.runner !== "jest") throw new ProtocolError(`an adopted test is selected by name, which ${input.runner} is not supported for`);
  const fixed = revisionEvidence(input, "fixed", session.fixed_sha, FIXED_RUNS);
  const broken = revisionEvidence(input, "broken", session.broken_sha, BROKEN_RUNS);
  const b = broken.runs[0];
  return {
    schema_version: "1.0",
    verification_id: session.verification_session_id,
    candidate_digest: manifest.candidate_digest,
    verification_protocol_version: session.verification_protocol_version,
    producer: { identity: input.producer, execution_id: randomUUID(), host_platform: `${process.platform}-${process.arch}` },
    fixed: { ...fixed, repeated_runs: fixed.runs.length, normalized_results: fixed.runs.map((r) => r.result), discovered_test_count: fixed.runs[0]?.discovered ?? 0, executed_test_count: fixed.runs[0]?.executed ?? 0 },
    broken: { ...broken, result: b.result, discovered_test_count: b.discovered, executed_test_count: b.executed, ...b.assertion_id ? { assertion_id: b.assertion_id, expected: b.expected, actual: b.actual } : {} }
  };
}
function revisionEvidence(input, name, revision, runs) {
  const { dir, cwd, target, notes } = prepare(input, name, revision);
  try {
    const bin = runnerBin(input, dir, cwd);
    const lock = [.../* @__PURE__ */ new Set([cwd, dir])].flatMap((d) => LOCKFILES.map((f) => path.join(d, f))).find(existsSync2);
    const environment = { node: process.version, runner: runnerVersion(input.runner, bin, cwd), lockfile: lock ? digestOf(readFileSync(lock)) : "none", dependencies: input.install ? `install: ${input.install}` : input.deps };
    const results = [];
    for (let i = 0; i < runs; i++) results.push(runOnce(input, cwd, bin));
    const placed = digestOf(readFileSync(target));
    return { revision, environment, environment_digest: digestOf(JSON.stringify(environment)), candidate_artifact_digest: placed, notes, runs: results };
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: input.repo });
  }
}
function prepare(input, name, revision) {
  const { repo, manifest } = input;
  const prefix = input.prefix ?? "";
  const dir = path.join(repo, ".everrule-verify", `${name}-${revision.slice(0, 12)}`);
  rmSync(dir, { recursive: true, force: true });
  spawnSync("git", ["worktree", "prune"], { cwd: repo });
  git(repo, ["worktree", "add", "--detach", dir, revision]);
  const cwd = path.join(dir, prefix);
  const rel = path.posix.join(prefix, manifest.artifact.path);
  const target = path.join(dir, rel);
  const notes = [];
  let p = dir;
  for (const part of path.posix.dirname(rel).split("/")) {
    if (part === ".") continue;
    p = path.join(p, part);
    if (existsSync2(p) && lstatSync(p).isSymbolicLink()) throw new ProtocolError(`${p} is a symbolic link`);
  }
  if (existsSync2(target) && lstatSync(target).isSymbolicLink()) throw new ProtocolError(`${manifest.artifact.path} is a symbolic link at ${revision}`);
  if (manifest.artifact.adopted_test) {
    const present = existsSync2(target) ? digestOf(readFileSync(target)) : null;
    if (name === "fixed" && present !== manifest.artifact.digest) throw new ProtocolError(`${manifest.artifact.path} at ${revision} is not the adopted test's exact bytes`);
    if (name === "broken" && present !== manifest.artifact.digest) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, input.candidate);
      notes.push(present ? "the adopted test's own earlier version was replaced by the exact candidate in the temporary worktree" : "the adopted test did not exist at this commit; the exact candidate was placed in the temporary worktree");
    }
  } else {
    if (existsSync2(target)) throw new ProtocolError(`${manifest.artifact.path} already exists at ${revision}; a candidate never replaces a file`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, input.candidate);
  }
  if (input.install) {
    const r = spawnSync(input.install, { cwd: dir, shell: true, encoding: "utf8", timeout: input.timeoutMs * 5, env: childEnv() });
    notes.push(`dependencies installed with the approved command "${input.install}" (exit ${r.status})`);
  } else if (input.deps === "link") {
    let linked = false;
    for (const sub of /* @__PURE__ */ new Set(["", prefix])) {
      const from = path.join(repo, sub, "node_modules");
      const to = path.join(dir, sub, "node_modules");
      if (existsSync2(from) && !existsSync2(to)) {
        mkdirSync(path.dirname(to), { recursive: true });
        symlinkSync(from, to, "dir");
        linked = true;
      }
    }
    if (linked) notes.push("node_modules linked from the clone's current checkout; dependencies may differ from the historical revision");
  }
  return { dir, cwd, target, notes };
}
function runnerBin(input, dir, cwd) {
  const { cmd, bin } = runnerCommand(input.runner, input.manifest.artifact.path);
  if (!bin) return cmd;
  if (input.runnerBin) {
    const explicit = path.resolve(input.runnerBin);
    if (!existsSync2(explicit)) throw new ProtocolError(`no installed runner at ${explicit}`);
    return explicit;
  }
  const file = process.platform === "win32" ? `${cmd}.cmd` : cmd;
  const found = [cwd, dir].map((d) => path.join(d, "node_modules", ".bin", file)).find(existsSync2);
  if (!found) throw new ProtocolError(`no installed ${cmd} in the worktree's node_modules/.bin; install dependencies per your policy, link them, or pass --runner`);
  return found;
}
function runnerVersion(runner, bin, cwd) {
  if (runner === "node-test") return process.version;
  const r = runner === "pytest" ? spawnSync(bin, ["-m", "pytest", "--version"], { cwd, encoding: "utf8" }) : spawnSync(bin, ["--version"], { cwd, encoding: "utf8" });
  return ((r.stdout || "") + (r.stderr || "")).trim().split("\n")[0] ?? "";
}
function runOnce(input, cwd, bin) {
  const testPath = input.manifest.artifact.path;
  const report = path.join(cwd, `.everrule-verify-report.${REPORT_FORMAT[input.runner] === "junit" ? "xml" : "json"}`);
  rmSync(report, { force: true });
  const adopted = input.manifest.artifact.adopted_test?.test_name ?? null;
  const { args } = runnerCommand(input.runner, testPath, report);
  const select = adopted ? ["-t", `^${escapeRe(adopted)}$`] : [];
  const r = spawnSync(bin, [...args, ...select], { cwd, encoding: "utf8", timeout: input.timeoutMs, env: childEnv() });
  if (r.error?.code === "ETIMEDOUT" || r.signal) return { result: "INFRA_TIMEOUT", discovered: 0, executed: 0 };
  const text = existsSync2(report) ? readFileSync(report, "utf8") : null;
  rmSync(report, { force: true });
  const tail = ((r.stderr || "") + (r.error ? `
${r.error.message}` : "")).trim().split("\n").slice(-5).join("\n");
  if (text === null) return { result: "RUNNER_ERROR", discovered: 0, executed: 0, detail: tail };
  const file = readCases(input.runner, text, testPath, cwd);
  if (!file) return { result: "RUNNER_ERROR", discovered: 0, executed: 0, detail: "the runner's report could not be read" };
  const cases = file.cases.filter((c) => !adopted || c.path_name === adopted);
  const discovered = cases.length;
  const executed = cases.filter((c) => c.status !== "skipped").length;
  if (!file.found || discovered === 0) return { result: file.load_error !== void 0 ? "COLLECTION_FAILURE" : "NOT_DISCOVERED", discovered, executed, detail: (file.load_error ?? "").slice(0, 500) };
  if (executed === 0) return { result: "SKIPPED", discovered, executed };
  const failed = cases.find((c) => c.status === "failed");
  if (!failed) return { result: "PASS", discovered, executed };
  return { ...attribute(input, failed), discovered, executed };
}
var assertionAt = (m, line) => Object.entries(m.assertion_map).find(([, at]) => at === `${m.artifact.path}:${line}`)?.[0];
function attribute(input, failed) {
  const message = failed.message ?? "";
  const m = input.manifest;
  const nonBehavioral = { result: "NON_BEHAVIORAL_FAILURE", detail: (message.split("\n").find((l) => l.trim()) ?? "").slice(0, 300) };
  const lineIn = (re) => {
    const x = re.exec(message);
    return x ? Number(x[1]) : void 0;
  };
  const atLine = lineIn(new RegExp(`${escapeRe(m.artifact.path)}:(\\d+)(?::\\d+)?`));
  if (input.runner === "vitest") {
    const labelled = /AssertionError: ([a-z_]+): expected (-?\d+) to be (-?\d+)/.exec(message);
    if (labelled) return { result: "BEHAVIORAL_ASSERTION_FAILURE", assertion_id: labelled[1], actual: Number(labelled[2]), expected: Number(labelled[3]) };
    const id2 = atLine !== void 0 ? assertionAt(m, atLine) : void 0;
    const plain = /AssertionError: expected (-?\d+) to be (-?\d+)/.exec(message) ?? /to have a length of (-?\d+) but got (-?\d+)/.exec(message);
    if (id2 && plain) return { result: "BEHAVIORAL_ASSERTION_FAILURE", assertion_id: id2, .../to have a length/.test(plain[0]) ? { expected: Number(plain[1]), actual: Number(plain[2]) } : { actual: Number(plain[1]), expected: Number(plain[2]) } };
    return nonBehavioral;
  }
  let values;
  let isAssertion = false;
  if (input.runner === "node-test") {
    isAssertion = /ERR_ASSERTION|AssertionError/.test(message);
    const a = /\bactual: (-?\d+(?:\.\d+)?),/.exec(message), e = /\bexpected: (-?\d+(?:\.\d+)?),?\n/.exec(message);
    if (a && e) values = { actual: Number(a[1]), expected: Number(e[1]) };
  } else if (input.runner === "jest") {
    isAssertion = /expect\(/.test(message);
    const e = /Expected: (-?\d+(?:\.\d+)?)\b/.exec(message), a = /Received: (-?\d+(?:\.\d+)?)\b/.exec(message);
    if (a && e) values = { actual: Number(a[1]), expected: Number(e[1]) };
  } else {
    isAssertion = /^AssertionError|\bassert /m.test(message);
    const x = /assert (-?\d+(?:\.\d+)?) == (-?\d+(?:\.\d+)?)/.exec(message);
    if (x) values = { actual: Number(x[1]), expected: Number(x[2]) };
  }
  if (!isAssertion) return nonBehavioral;
  const line = atLine ?? (input.runner === "pytest" ? lineIn(new RegExp(`${escapeRe(path.posix.basename(m.artifact.path))}:(\\d+): AssertionError`)) : void 0);
  const id = (line !== void 0 ? assertionAt(m, line) : void 0) ?? (line !== void 0 ? `${failed.name} (line ${line})` : failed.name);
  return { result: "BEHAVIORAL_ASSERTION_FAILURE", assertion_id: id, ...values ?? {} };
}

// packages/prevention-contract/src/verify/drafts.ts
var VERIFY_PRODUCER = "everrule-evaluate verify";
var DEFAULT_VERIFY_TIMEOUT_MS = 12e4;
function git2(cwd, args) {
  const r = spawnSync2("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new ProtocolError(`git ${args.join(" ")}: ${(r.stderr || "failed").trim()}`);
  return r.stdout.trim();
}
function sessionFor(c, cwd, broken, fixed, candidate) {
  const dir = join2(cwd, ".everrule", "verify", c.id);
  if (existsSync3(join2(dir, "session.json")) || existsSync3(join2(dir, "manifest.json"))) {
    const session = JSON.parse(readFileSync2(join2(dir, "session.json"), "utf8"));
    const manifest = JSON.parse(readFileSync2(join2(dir, "manifest.json"), "utf8"));
    if (session.broken_sha !== broken || session.fixed_sha !== fixed) throw new ProtocolError(`the session's revisions (${session.broken_sha?.slice(0, 12)}, ${session.fixed_sha?.slice(0, 12)}) are not the draft's verification_target`);
    if (manifest.artifact?.path !== c.test.path) throw new ProtocolError(`the manifest's candidate is ${manifest.artifact?.path}, not the draft's test ${c.test.path}`);
    return { session, manifest, source: "package" };
  }
  const digest = digestOf(candidate);
  return {
    session: { verification_session_id: c.id, candidate_digest: digest, candidate_artifact_digest: digest, verification_protocol_version: VERIFICATION_PROTOCOL, broken_sha: broken, fixed_sha: fixed },
    manifest: { candidate_digest: digest, artifact: { path: c.test.path, digest }, assertion_map: {} },
    source: "contract"
  };
}
function outcomeOf(e) {
  const fixed = e.fixed.normalized_results;
  const at = (sha) => sha.slice(0, 7);
  if (new Set(fixed).size > 1) return { outcome: "flaky", detail: `the runs at the fix ${at(e.fixed.revision)} disagree: ${fixed.join(", ")}.` };
  if (fixed.length !== FIXED_RUNS || fixed[0] !== "PASS") return { outcome: "not_exact", detail: `the test does not pass at the fix ${at(e.fixed.revision)} (${fixed[0]}).` };
  if (e.broken.result === "PASS") return { outcome: "not_exact", detail: `the test also passes at the broken commit ${at(e.broken.revision)}, so it does not reproduce the incident.` };
  if (e.broken.result !== "BEHAVIORAL_ASSERTION_FAILURE") return { outcome: "not_exact", detail: `the test fails at the broken commit ${at(e.broken.revision)} without a behavioral assertion (${e.broken.result}); an error is not proof.` };
  const values = e.broken.expected !== void 0 ? ` (expected ${e.broken.expected}, actual ${e.broken.actual})` : "";
  return { outcome: "exact", detail: `passes ${FIXED_RUNS} times at ${at(e.fixed.revision)}; fails at ${at(e.broken.revision)} at ${e.broken.assertion_id}${values}.` };
}
function verifyDrafts(opts) {
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const drafts = opts.contracts.filter((c) => c.approval.status === "draft");
  const skipped = drafts.filter((c) => !c.verification_target).map((c) => c.id);
  const results = [];
  const errors = [];
  const root = git2(opts.cwd, ["rev-parse", "--show-toplevel"]);
  const prefix = git2(opts.cwd, ["rev-parse", "--show-prefix"]).replace(/\/$/, "");
  for (const c of drafts) {
    const target = c.verification_target;
    if (!target) continue;
    try {
      const testFile = join2(opts.cwd, c.test.path);
      if (!existsSync3(testFile)) throw new ProtocolError(`test file not found: ${c.test.path}`);
      const candidate = readFileSync2(testFile);
      if (c.test.sha256 && digestOf(candidate) !== `sha256:${c.test.sha256}`) throw new ProtocolError(`${c.test.path} does not match the draft's test.sha256`);
      const broken = git2(root, ["rev-parse", "--verify", `${target.base}^{commit}`]);
      const fixed = git2(root, ["rev-parse", "--verify", `${target.merge}^{commit}`]);
      const { session, manifest, source } = sessionFor(c, opts.cwd, broken, fixed, candidate);
      const evidence = runProtocol({ repo: root, prefix, session, manifest, candidate, runner: c.test.runner, deps: "link", ...opts.install ? { install: opts.install } : {}, timeoutMs: opts.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS, producer: VERIFY_PRODUCER });
      results.push({ id: c.id, test: c.test.path, runner: c.test.runner, session_source: source, evidence, ...outcomeOf(evidence) });
    } catch (e) {
      if (!(e instanceof ProtocolError)) throw e;
      errors.push({ id: c.id, detail: e.message });
    }
  }
  const status = errors.length ? "error" : results.length === 0 ? "nothing_to_verify" : results.every((r) => r.outcome === "exact") ? "exact" : "not_exact";
  return { schema: VERIFICATION_SCHEMA, generated_at: now().toISOString(), results, skipped, errors, status };
}
function summarizeVerification(report) {
  const head = report.status === "exact" ? "EverRule verify: every draft fails at its broken commit and passes at its fix" : report.status === "not_exact" ? "EverRule verify: a draft did not verify exactly" : report.status === "error" ? "EverRule verify: the protocol could not run for a draft" : "EverRule verify: no draft has a verification target";
  const lines = [`## ${head}`, ""];
  for (const r of report.results) lines.push(`- **${r.id}** ${r.outcome.toUpperCase().replace("_", " ")}: ${r.detail}`, `  - test \`${r.test}\` (${r.runner}); session from the ${r.session_source === "package" ? "pushed package" : "draft"}`);
  for (const e of report.errors) lines.push(`- **${e.id}** COULD NOT RUN: ${e.detail}`);
  if (report.skipped.length) lines.push("", `No verification_target, not run: ${report.skipped.join(", ")}.`);
  lines.push("", "This is evidence for EverRule to classify and for the approver. It does not approve anything.");
  return lines.join("\n");
}
function exitCodeForVerification(report) {
  return report.status === "error" ? 3 : 0;
}

// packages/prevention-contract/src/explain.ts
var MAX_LINES = 20;
function parseUnifiedDiff(text) {
  const added = [];
  const removed = [];
  let path2 = "";
  let oldLine = 0;
  let newLine = 0;
  let deletionOnly = false;
  let hunkNewStart = 0;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      path2 = raw.replace(/^diff --git a\/.* b\//, "");
      continue;
    }
    if (raw.startsWith("+++ ")) {
      if (raw !== "+++ /dev/null") path2 = raw.slice(4).replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("--- ")) continue;
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(raw);
    if (h) {
      oldLine = Number(h[1]);
      newLine = Number(h[3]);
      hunkNewStart = newLine;
      deletionOnly = h[4] === "0";
      continue;
    }
    if (!path2 || raw.startsWith("\\")) continue;
    if (raw.startsWith("+")) added.push({ path: path2, line: newLine++, text: raw.slice(1) });
    else if (raw.startsWith("-")) removed.push({ path: path2, line: oldLine++, at: Math.max(1, deletionOnly ? hunkNewStart : newLine), text: raw.slice(1) });
    else if (raw.startsWith(" ")) {
      oldLine++;
      newLine++;
    }
  }
  return { added, removed };
}
var meaningful = (s) => /[A-Za-z0-9]/.test(s) && s.trim().length >= 4;
var same = (a, b) => a.trim() === b.trim();
function cleanMessage(m) {
  return m.replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() && !/^\s*at /.test(l)).slice(0, 3).map((l) => l.trim().slice(0, 200));
}
var code = (lines, sign) => ["```diff", ...lines.slice(0, MAX_LINES).map((l) => `${sign}${l}`), ...lines.length > MAX_LINES ? [` … ${lines.length - MAX_LINES} more`] : [], "```"];
function explainRegression(i) {
  const c = i.contract;
  const incident = c.incident?.id;
  const title = c.incident?.title;
  const what = incident ? title ? title.startsWith(incident) ? title : `${incident}: ${title}` : incident : c.id;
  const fixOf = incident ? `the fix for ${incident}` : "the fix";
  const inScope = (path2) => matchesScope(c, [path2]).length > 0;
  const level = i.result.advisory_until ? "warning" : "error";
  const prefix = i.pathPrefix ?? "";
  const lines = [];
  lines.push(`### ${i.rehearsal ? "Rehearsal: this pull request brings back" : "This pull request brings back"} ${what}`, "");
  if (i.rehearsal) lines.push("Labelled `everrule:rehearsal`: it shows the protection working and is not counted as a regression caught.", "");
  if (i.result.advisory_until) lines.push(`This protection is in burn-in until ${i.result.advisory_until.slice(0, 10)}, so this is a warning, not a block.`, "");
  const a = c.approval;
  lines.push(`**The rule** (${c.id}${a.approver_name ? `, approved by ${a.approver_name}${a.approver_role ? `, ${a.approver_role}` : ""}` : ""}): ${c.requirement.statement}`, "");
  lines.push(`**What the test saw:** ${i.result.failed_cases.length ? i.result.failed_cases.map((x) => `\`${x}\``).join(", ") : i.result.detail}`);
  const msg = i.messages.flatMap(cleanMessage).slice(0, 6);
  if (msg.length) lines.push("```", ...msg, "```");
  lines.push("");
  const annotations = [];
  const fixAdded = (i.fix?.added ?? []).filter((l) => inScope(l.path));
  const fixRemoved = (i.fix?.removed ?? []).filter((l) => inScope(l.path));
  if (i.fix && i.change) {
    const undone = i.change.removed.filter((r) => inScope(r.path) && meaningful(r.text) && fixAdded.some((f) => f.path === r.path && same(f.text, r.text)));
    const back = i.change.added.filter((r) => inScope(r.path) && meaningful(r.text) && fixRemoved.some((f) => f.path === r.path && same(f.text, r.text)));
    if (undone.length || back.length) {
      const spots = /* @__PURE__ */ new Map();
      const spot = (path2, line) => {
        const k = `${path2}:${line}`;
        if (!spots.has(k)) spots.set(k, { path: path2, line, removes: [], restores: [] });
        return spots.get(k);
      };
      for (const r of undone) spot(r.path, r.at).removes.push(r.text);
      for (const r of back) spot(r.path, r.line).restores.push(r.text);
      const n = (k, what2) => k === 1 ? `a line ${fixOf} ${what2}` : `${k} lines ${fixOf} ${what2}`;
      lines.push("**Where:**");
      for (const sp of spots.values()) {
        if (sp.removes.length) lines.push(`- \`${sp.path}\` line ${sp.line} removes ${n(sp.removes.length, "added")}:`, ...code(sp.removes, "-"));
        if (sp.restores.length) lines.push(`- \`${sp.path}\` line ${sp.line} brings back ${n(sp.restores.length, "removed")}:`, ...code(sp.restores, "+"));
        const said = [
          ...sp.removes.length ? [`This change removes ${n(sp.removes.length, "added")}:`, ...sp.removes.map((t) => `  ${t.trim()}`)] : [],
          ...sp.restores.length ? [`This change brings back ${n(sp.restores.length, "removed")}:`, ...sp.restores.map((t) => `  ${t.trim()}`)] : []
        ];
        annotations.push({ level, path: prefix + sp.path, line: sp.line, title: `EverRule: ${incident ?? c.id} would come back`, message: [...said, c.requirement.statement].join("\n") });
      }
      lines.push("");
    } else {
      const touched = [...new Set([...i.change.added, ...i.change.removed].map((l) => l.path).filter(inScope))];
      lines.push(`**Where:** this pull request does not remove the fix's lines; it changes the behavior another way, in ${touched.length ? touched.map((p) => `\`${p}\``).join(", ") : "the rule's scope"}.`, "");
    }
  }
  const v = c.verification;
  if (v?.mode === "exact") {
    const pr = c.incident?.fix_pr;
    lines.push(`**How it was fixed before:** ${pr ? `[${fixOf}](${pr})` : fixOf}, from \`${v.broken_revision.slice(0, 7)}\` to \`${v.fixed_revision.slice(0, 7)}\`.`);
    if (!i.fix) lines.push("Its lines are not shown: the fix's commits are not in this checkout. Check out with `fetch-depth: 0` to see them.");
    else if (fixAdded.length || fixRemoved.length) {
      lines.push("Its changes in this rule's scope:", ...code([...fixRemoved.map((l) => `-${l.text}`), ...fixAdded.map((l) => `+${l.text}`)], ""));
    }
    lines.push("");
  } else if (v?.mode === "effect_boundary") {
    lines.push(`**How it was proven:** at the effect boundary. ${v.limitation}`, "");
  } else if (v?.mode === "asserted") {
    lines.push(`**Basis:** team-written and not proven against a failure. ${v.basis}`, "");
  }
  lines.push(`**What to do:** restore the behavior the rule describes${v?.mode === "exact" ? " (the fix above shows how it was done)" : ""}. If the rule itself should change, amend the contract in a pull request and have ${a.approver_name ?? "its owner"} approve it again; the check does not pass on a loosened rule without that approval.`);
  return { markdown: lines.join("\n"), annotations };
}
function explainFailures(record, contracts, messages, deps) {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const rehearsal = record.event?.pr_labels.includes("everrule:rehearsal") ?? false;
  const change = deps.base ? parse(deps.diff(deps.base, "HEAD")) : null;
  const parts = [];
  const annotations = [];
  for (const r of record.applicable.filter((x) => x.result === "BEHAVIOR_FAIL")) {
    const c = byId.get(r.id);
    if (!c) continue;
    const fix = c.verification?.mode === "exact" ? parse(deps.diff(c.verification.broken_revision, c.verification.fixed_revision)) : null;
    const e = explainRegression({ contract: c, result: r, messages: messages.get(r.id) ?? [], fix, change, rehearsal, ...deps.pathPrefix ? { pathPrefix: deps.pathPrefix } : {} });
    parts.push(e.markdown);
    annotations.push(...e.annotations);
  }
  return { markdown: parts.join("\n\n"), annotations };
}
var parse = (text) => text === null ? null : parseUnifiedDiff(text);
function safeRef(ref) {
  return /^[A-Za-z0-9][A-Za-z0-9._/~^-]{0,199}$/.test(ref) && !ref.includes("..");
}
function annotationCommand(a) {
  const data = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
  const prop = (s) => data(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
  return `::${a.level} file=${prop(a.path)},line=${a.line},title=${prop(a.title)}::${data(a.message)}`;
}

// packages/prevention-contract/src/cli.ts
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (fallback !== void 0) return fallback;
  throw new Error(`missing --${name}`);
}
function loadContracts(dir) {
  if (!existsSync4(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => {
    const parsed = PreventionContract.safeParse(JSON.parse(readFileSync3(join3(dir, f), "utf8")));
    if (!parsed.success) throw new ContractError(`${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    return parsed.data;
  });
}
var ContractError = class extends Error {
};
var readIfPresent = (path2) => {
  try {
    return readFileSync3(path2, "utf8");
  } catch {
    return null;
  }
};
var readTest = (path2) => existsSync4(path2) ? readFileSync3(path2, "utf8") : null;
function readBaseContracts(base, dir) {
  const git3 = (args) => {
    const r = spawnSync3("git", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error((r.stderr || `git ${args[0]} failed`).trim());
    return r.stdout;
  };
  const prefix = dir.replace(/\/+$/, "");
  return git3(["ls-tree", "--name-only", base, "--", `${prefix}/`]).split("\n").map((s) => s.trim()).filter((f) => f.endsWith(".json")).flatMap((f) => {
    const raw = JSON.parse(git3(["show", `${base}:./${f}`]));
    return typeof raw.id === "string" ? [{ id: raw.id, status: String(raw.approval?.status ?? "draft") }] : [];
  });
}
function hashFor(contractFile) {
  const raw = JSON.parse(readFileSync3(contractFile, "utf8"));
  const source = readTest(raw?.test?.path ?? "");
  if (source === null) throw new Error(`test file not found: ${raw?.test?.path} (run from the repository root)`);
  return approvalHashes(raw, source);
}
async function main() {
  if (process.argv[2] === "hash") {
    const file = process.argv[3];
    if (!file) throw new Error("usage: everrule-evaluate hash <contract.json>");
    const h = hashFor(file);
    console.log(`test.sha256            ${h.test_sha256}
approval.contract_hash ${h.contract_hash}`);
    return;
  }
  if (process.argv[2] === "verify") {
    const install = process.argv.includes("--install") ? arg("install") : "";
    const minutes2 = process.argv.includes("--timeout") ? Number(arg("timeout")) : 2;
    if (!(minutes2 > 0)) throw new Error("--timeout must be a number of minutes above 0");
    const report = verifyDrafts({ contracts: loadContracts(arg("contracts", ".everrule/contracts")), cwd: process.cwd(), ...install ? { install } : {}, timeoutMs: minutes2 * 6e4 });
    writeFileSync2(arg("out", "verification.json"), JSON.stringify(report, null, 2) + "\n");
    const md2 = summarizeVerification(report);
    console.log(md2);
    if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], md2 + "\n");
    process.exit(exitCodeForVerification(report));
  }
  const contractsDir = arg("contracts", ".everrule/contracts");
  const changedFile = arg("changed-files");
  const out = arg("out", ".everrule/last-evaluation.json");
  const base = process.argv.includes("--base") ? arg("base") : void 0;
  const changedFiles = readFileSync3(changedFile, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const contracts = loadContracts(contractsDir);
  let baseContracts = null;
  let baseError;
  if (base) {
    try {
      baseContracts = readBaseContracts(base, contractsDir);
    } catch (e) {
      baseError = e instanceof Error ? e.message : String(e);
    }
  }
  const integrity = checkIntegrity({ contracts, readTest, base: baseContracts, ...baseError ? { baseError } : {} });
  const minutes = process.argv.includes("--timeout") ? Number(arg("timeout")) : DEFAULT_TIMEOUT_MS / 6e4;
  if (!(minutes > 0)) throw new Error("--timeout must be a number of minutes above 0");
  let event = null;
  if (process.argv.includes("--event")) {
    const name = process.env["GITHUB_EVENT_NAME"];
    if (!name) throw new Error("--event needs GITHUB_EVENT_NAME, which GitHub Actions sets");
    event = eventFrom(name, JSON.parse(readFileSync3(arg("event"), "utf8")));
  }
  const reportDir = mkdtempSync(join3(tmpdir(), "everrule-reports-"));
  let record;
  const failureMessages = /* @__PURE__ */ new Map();
  try {
    record = await execute(plan(contracts, changedFiles, integrity), changedFiles, execIn(process.cwd()), { reportDir, cwd: process.cwd(), readFile: readIfPresent, timeoutMs: minutes * 6e4, event, backlog: checkBacklog(readIfPresent(join3(dirname2(contractsDir), "backlog.json"))), onFailure: (id, m) => failureMessages.set(id, m) });
  } finally {
    rmSync2(reportDir, { recursive: true, force: true });
  }
  writeFileSync2(out, JSON.stringify(record, null, 2) + "\n");
  let md = summarize(record, contracts);
  const explained = explainFailures(record, contracts, failureMessages, { diff: gitDiff, ...base ? { base } : {}, pathPrefix: gitPrefix() });
  if (explained.markdown) md += "\n\n" + explained.markdown;
  console.log(md);
  for (const a of explained.annotations) console.log(annotationCommand(a));
  if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], md + "\n");
  process.exit(exitCodeFor(record));
}
function gitDiff(from, to) {
  if (!safeRef(from) || !safeRef(to)) return null;
  const r = spawnSync3("git", ["diff", "-U0", "--no-color", "--no-ext-diff", "--relative", from, to, "--"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
function gitPrefix() {
  const r = spawnSync3("git", ["rev-parse", "--show-prefix"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}
function run() {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(e instanceof ContractError ? 2 : 3);
  });
}
if (process.argv[1] && process.argv[1].endsWith("cli.ts")) run();

// packages/prevention-contract/src/bin.ts
run();
