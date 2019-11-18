(function() {
    function mergeOpts(allOptions, targetType) {
        var finalOpts = {};
        var name;

        for (name in allOptions) {
            if (name !== targetType) {
                finalOpts[name] = allOptions[name];
            }
        }

        if (targetType in allOptions) {
            for (name in allOptions[targetType]) {
                finalOpts[name] = allOptions[targetType][name];
            }
        }
        return finalOpts;
    }

    var lineBreak = /\r\n|[\n\r\u2028\u2029]/;
    var allLineBreaks = new RegExp(lineBreak.source, 'g');

    function css_beautify(source_text, options) {
        options = options || {};

        options = mergeOpts(options, 'css');

        source_text = source_text || '';

        var newlinesFromLastWSEat = 0;
        var indentSize = options.indent_size ? parseInt(options.indent_size, 10) : 4;
        var indentCharacter = options.indent_char || ' ';
        var eol = options.eol ? options.eol : 'auto';
        var {
            preserve_newlines = false,
            selector_separator_newline = true,
            end_with_newline = false,
            newline_between_rules = true,
            space_around_combinator = true,
            indent_conditional = true,
            newline_between_properties = true,
            newline_before_open_brace = false,
            newline_after_open_brace = true,
            newline_before_close_brace = true,
        } = options;

        var translatePos = (options.translate_positions || [])[0];
        var translatePosIndex = 0;
        var translatePosLine = translatePos && translatePos.line;
        var translatePosCol = translatePos && translatePos.ch;
        var inputPosLine = 0, inputPosCol = 0;
        var outputPosLine = 0, outputPosCol = 0;

        if (options.indent_with_tabs) {
            indentCharacter = '\t';
            indentSize = 1;
        }

        if (eol === 'auto') {
            eol = '\n';
            if (source_text && lineBreak.test(source_text || '')) {
                eol = source_text.match(lineBreak)[0];
            }
        }

        eol = eol.replace(/\\r/, '\r').replace(/\\n/, '\n');

        source_text = source_text.replace(allLineBreaks, '\n');

        var whiteRe = /^\s+$/;

        var pos = -1,
            ch;
        var parenLevel = 0;

        function next(resetLine, resetCol) {
            if (resetLine !== undefined) {
                inputPosLine = resetLine;
                inputPosCol = resetCol;
                if (inputPosCol < 0) {
                    inputPosLine--;
                    inputPosCol = pos - source_text.lastIndexOf('\n', pos);
                }
            }
            ch = source_text.charAt(++pos);
            if (translatePos) {
                inputPosCol++;
                if (ch == '\n') {
                    inputPosLine++;
                    inputPosCol = 0;
                }
                if (inputPosLine == translatePosLine && inputPosCol >= translatePosCol
                || inputPosLine > translatePosLine) {
                    translatePos.line = outputPosLine - (inputPosLine - translatePosLine);
                    translatePos.ch = outputPosCol - (inputPosCol - translatePosCol);
                    translatePos.ch += translatePos.ch ? 1 : 0;
                    translatePos = options.translate_positions[++translatePosIndex];
                    translatePosLine = translatePos && translatePos.line;
                    translatePosCol = translatePos && translatePos.ch;
                }
            }
            return ch || '';
        }

        function peek(skipWhitespace) {
            var result = '';
            var prev_pos = pos;
            var prevInputPosLine = inputPosLine;
            var prevInputPosCol = inputPosCol;
            if (skipWhitespace) {
                eatWhitespace();
            }
            result = source_text.charAt(pos + 1) || '';
            pos = prev_pos - 1;
            next(prevInputPosLine, prevInputPosCol - 1);
            return result;
        }

        function eatString(endChars) {
            var start = pos;
            while (next()) {
                if (ch === "\\") {
                    next();
                } else if (endChars.indexOf(ch) !== -1) {
                    break;
                } else if (ch === "\n") {
                    break;
                }
            }
            return source_text.substring(start, pos + 1);
        }

        function peekString(endChar) {
            var prev_pos = pos;
            var prevInputPosLine = inputPosLine;
            var prevInputPosCol = inputPosCol;
            var str = eatString(endChar);
            pos = prev_pos - 1;
            next(prevInputPosLine, prevInputPosCol - 1);
            return str;
        }

        function eatWhitespace(preserve_newlines_local) {
            var result = 0;
            while (whiteRe.test(peek())) {
                next();
                if (ch === '\n' && preserve_newlines_local && preserve_newlines) {
                    print.newLine(true);
                    result++;
                }
            }
            newlinesFromLastWSEat = result;
            return result;
        }

        function skipWhitespace() {
            var result = '';
            if (ch && whiteRe.test(ch)) {
                result = ch;
            }
            while (whiteRe.test(next())) {
                result += ch;
            }
            return result;
        }

        function eatComment(singleLine) {
            var start = pos;
            singleLine = peek() === "/";
            next();
            while (next()) {
                if (!singleLine && ch === "*" && peek() === "/") {
                    next();
                    break;
                } else if (singleLine && ch === "\n") {
                    return source_text.substring(start, pos);
                }
            }

            return source_text.substring(start, pos) + ch;
        }

        function lookBack(str) {
            return source_text.substring(pos - str.length, pos).toLowerCase() ===
                str;
        }

        function foundNestedPseudoClass() {
            var openParen = 0;
            for (var i = pos + 1; i < source_text.length; i++) {
                var ch = source_text.charAt(i);
                if (ch === "{") {
                    return true;
                } else if (ch === '(') {
                    openParen += 1;
                } else if (ch === ')') {
                    if (openParen === 0) {
                        return false;
                    }
                    openParen -= 1;
                } else if (ch === ";" || ch === "}") {
                    return false;
                }
            }
            return false;
        }

        var basebaseIndentString = source_text.match(/^[\t ]*/)[0];
        var singleIndent = new Array(indentSize + 1).join(indentCharacter);
        var indentLevel = 0;
        var nestedLevel = 0;

        function indent() {
            indentLevel++;
            basebaseIndentString += singleIndent;
        }

        function outdent() {
            indentLevel--;
            basebaseIndentString = basebaseIndentString.slice(0, -indentSize);
        }

        var print = {};
        print["{"] = function(ch) {
            newline_before_open_brace ? print.newLine() : print.singleSpace();
            output.push(ch);
            outputPosCol++;
            if (!enteringConditionalGroup || indent_conditional) {
                indent();
            }
            if (!eatWhitespace(true)) {
                newline_after_open_brace || enteringConditionalGroup ? print.newLine() : print.singleSpace();
            }
        };
        print["}"] = function(newline) {
            if (newline) {
                newline_before_close_brace ? print.newLine() : (print.trim(), print.singleSpace());
            }
            output.push('}');
            outputPosCol++;
            if (!eatWhitespace(true) && peek(true) != '}') {
                print.newLine();
            }
        };

        print._lastCharWhitespace = function() {
            return whiteRe.test(output[output.length - 1]);
        };

        print.newLine = function(keepWhitespace) {
            if (output.length) {
                if (!keepWhitespace && output[output.length - 1] !== '\n') {
                    print.trim();
                } else if (output[output.length - 1] === basebaseIndentString) {
                    output.pop();
                    outputPosCol -= basebaseIndentString.length;
                }
                output.push('\n');
                outputPosLine++;
                outputPosCol = 0;

                if (basebaseIndentString) {
                    output.push(basebaseIndentString);
                    outputPosCol += basebaseIndentString.length;
                }
            }
        };
        print.singleSpace = function() {
            if (output.length && !print._lastCharWhitespace()) {
                output.push(' ');
                outputPosCol++;
            }
        };

        print.preserveSingleSpace = function() {
            if (isAfterSpace) {
                print.singleSpace();
            }
        };

        print.trim = function() {
            while (print._lastCharWhitespace()) {
                const text = output.pop();
                if (text.indexOf('\n') >= 0) {
                    outputPosLine -= text.match(/\n/g).length;
                }
            }
            outputPosCol = 0;
            let i = output.length;
            let token;
            while (--i >= 0 && (token = output[i]) != '\n') {
                outputPosCol += token.length;
            }
        };

        print.text = function(text) {
            output.push(text);
            if (text.indexOf('\n') < 0) {
                outputPosCol += text.length;
            } else {
                outputPosLine += text.match(/\n/g).length;
                outputPosCol = text.length - text.lastIndexOf('\n') - 1;
            }
        };

        var output = [];

        var insideRule = false;
        var insidePropertyValue = false;
        var enteringConditionalGroup = false;
        var insideConditionalGroup = false;
        var top_ch = '';
        var last_top_ch = '';

        while (true) {
            var whitespace = skipWhitespace();
            var isAfterSpace = whitespace !== '';
            var isAfterNewline = whitespace.indexOf('\n') !== -1;
            last_top_ch = top_ch;
            top_ch = ch;

            if (!ch) {
                break;
            } else if (ch === '/' && peek() === '*') {
                print.text(eatComment());
                if (peek() !== ';') print.newLine();
            } else if (ch === '/' && peek() === '/') {
                if (!isAfterNewline && last_top_ch !== '{') {
                    print.trim();
                }
                print.singleSpace();
                print.text(eatComment());
                print.newLine();
            } else if (ch === '@') {
                print.preserveSingleSpace();

                if (peek() === '{') {
                    print.text(eatString('}'));
                } else {
                    output.push(ch);
                    outputPosCol++;

                    var variableOrRule = peekString(": ,;{}()[]/='\"");

                    if (variableOrRule.match(/[ :]$/)) {
                        next();
                        variableOrRule = eatString(": ").replace(/\s$/, '');
                        print.text(variableOrRule);
                        print.singleSpace();
                    }

                    variableOrRule = '@' + variableOrRule.replace(/\s$/, '');

                    if (variableOrRule in css_beautify.NESTED_AT_RULE) {
                        nestedLevel += 1;
                        if (variableOrRule in css_beautify.CONDITIONAL_GROUP_RULE) {
                            enteringConditionalGroup = true;
                            if (!indent_conditional) {
                                nestedLevel--;
                            }
                        }
                    }
                }
            } else if (ch === '#' && peek() === '{') {
                print.preserveSingleSpace();
                print.text(eatString('}'));
            } else if (ch === '{') {
                if (peek(true) === '}') {
                    eatWhitespace();
                    next();
                    print.singleSpace();
                    output.push("{");
                    outputPosCol++;
                    print['}'](false);
                    if (newlinesFromLastWSEat < 2 && newline_between_rules && indentLevel === 0) {
                        print.newLine(true);
                    }
                } else {
                    print["{"](ch);
                    if (enteringConditionalGroup) {
                        enteringConditionalGroup = false;
                        insidePropertyValue = false;
                        insideConditionalGroup = true;
                        insideRule = (indentLevel > nestedLevel);
                    } else {
                        insideRule = (indentLevel >= nestedLevel);
                    }
                }
            } else if (ch === '}') {
                outdent();
                print["}"](true);
                insideRule = false;
                insidePropertyValue = false;
                if (nestedLevel && (indent_conditional || !insideConditionalGroup)) {
                    nestedLevel--;
                }
                insideConditionalGroup = false;
                if (newlinesFromLastWSEat < 2
                && newline_between_rules
                && peek(true) != '}') {
                    print.newLine(true);
                }
            } else if (ch === ":") {
                eatWhitespace();
                if ((insideRule || enteringConditionalGroup) &&
                    !(lookBack("&") || foundNestedPseudoClass()) &&
                    !lookBack("(")) {
                    output.push(':');
                    outputPosCol++;
                    if (!insidePropertyValue) {
                        insidePropertyValue = true;
                        print.singleSpace();
                    }
                } else {
                    if (lookBack(" ") && outputPosCol && !/\s$/.test(output[output.length - 1])) {
                        output.push(" ");
                        outputPosCol++;
                    }

                    if (peek() === ":") {
                        next();
                        output.push("::");
                        outputPosCol += 2;
                    } else {
                        output.push(':');
                        outputPosCol++;
                    }
                }
            } else if (ch === '"' || ch === '\'') {
                print.preserveSingleSpace();
                print.text(eatString(ch));
            } else if (ch === ';') {
                insidePropertyValue = false;
                output.push(ch);
                outputPosCol++;
                if (!eatWhitespace(true)) {
                    newline_between_properties ? print.newLine() : print.singleSpace();
                }
            } else if (ch === '(') {
                if (lookBack("url")) {
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                    if (next()) {
                        if (ch !== ')' && ch !== '"' && ch !== '\'') {
                            print.text(eatString(')'));
                        } else {
                            pos--;
                        }
                    }
                } else {
                    parenLevel++;
                    print.preserveSingleSpace();
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                }
            } else if (ch === ')') {
                output.push(ch);
                outputPosCol++;
                parenLevel--;
            } else if (ch === ',') {
                output.push(ch);
                outputPosCol++;
                if (!eatWhitespace(true) && selector_separator_newline && !insidePropertyValue && parenLevel < 1) {
                    print.newLine();
                } else {
                    print.singleSpace();
                }
            } else if ((ch === '>' || ch === '+' || ch === '~') &&
                !insidePropertyValue && parenLevel < 1) {
                if (space_around_combinator) {
                    print.singleSpace();
                    output.push(ch);
                    outputPosCol++;
                    print.singleSpace();
                } else {
                    output.push(ch);
                    outputPosCol++;
                    eatWhitespace();
                    if (ch && whiteRe.test(ch)) {
                        ch = '';
                    }
                }
            } else if (ch === ']') {
                output.push(ch);
                outputPosCol++;
            } else if (ch === '[') {
                print.preserveSingleSpace();
                output.push(ch);
                outputPosCol++;
            } else if (ch === '=') {
                eatWhitespace();
                output.push('=');
                outputPosCol++;
                if (whiteRe.test(ch)) {
                    ch = '';
                }
            } else {
                print.preserveSingleSpace();
                output.push(ch);
                outputPosCol++;
            }
        }

        var sweetCode = '';
        if (basebaseIndentString) {
            sweetCode += basebaseIndentString;
        }

        sweetCode += output.join('').replace(/[\r\n\t ]+$/, '');

        if (end_with_newline) {
            sweetCode += '\n';
        }

        if (eol !== '\n') {
            sweetCode = sweetCode.replace(/[\n]/g, eol);
        }

        return sweetCode;
    }

    css_beautify.NESTED_AT_RULE = {
        "@page": true,
        "@font-face": true,
        "@keyframes": true,
        "@media": true,
        "@supports": true,
        "@-moz-document": true
    };
    css_beautify.CONDITIONAL_GROUP_RULE = {
        "@media": true,
        "@supports": true,
        "@-moz-document": true
    };

    if (typeof define === "function" && define.amd) {
        define([], function() {
            return {
                css_beautify: css_beautify
            };
        });
    } else if (typeof exports !== "undefined") {
        exports.css_beautify = css_beautify;
    } else if (typeof window !== "undefined") {
        window.css_beautify = css_beautify;
    } else if (typeof global !== "undefined") {
        global.css_beautify = css_beautify;
    }

}());
