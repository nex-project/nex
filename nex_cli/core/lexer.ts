import { SourceLocation, SourceReference } from "./source";
import { Token, TokenType } from "./token";
import { sum } from "./util";

export class LexingMode {
    validTokenTypes: TokenType[];
    skipWhitespace: boolean;

    constructor(validTokenTypes: TokenType[], skipWhitespace: boolean) {
        this.validTokenTypes = validTokenTypes;
        this.skipWhitespace = skipWhitespace;
    }
}

type MatchFunction = (remainingContent: string) => string | null;

/**
 * Provides information on how to match a given token in a string.
 */
class TokenPattern {
    private _regexPattern: RegExp | null;
    private _exactPattern: string | null;
    private _matchFunction: MatchFunction | null;
    tokenType: TokenType;

    private constructor(
        token: TokenType,
        regex: RegExp | null,
        matcher: MatchFunction | null,
        exact: string | null
    ) {
        this.tokenType = token;
        this._regexPattern = regex;
        this._matchFunction = matcher;
        this._exactPattern = exact;
    }

    /**
     * Create a token pattern via a regex.
     *
     * **NOTE: The provided regex should match only at the start of the string
     * (i.e. the regex should start with `^`), and also be global.
     * Example: `/^abc/g`**
     */
    static createWithRegex(type: TokenType, pattern: RegExp): TokenPattern {
        if (!pattern.global) {
            throw new Error("Provided pattern must be global");
        }

        return new TokenPattern(type, pattern, null, null);
    }

    static createWithMatcher(type: TokenType, matcher: MatchFunction): TokenPattern {
        return new TokenPattern(type, null, matcher, null);
    }

    static createWithStringPattern(type: TokenType, pattern: string): TokenPattern {
        return new TokenPattern(type, null, null, pattern);
    }

    /**
     * Attempt to match the provided string to this token pattern.
     * If successful, return the matched token content string.
     */
    match(remainingContent: string): string | null {
        if (this._regexPattern) {
            let match = remainingContent.match(this._regexPattern);

            if (match) {
                return match[0];
            }
        }

        if (this._matchFunction) {
            return this._matchFunction(remainingContent);
        }

        if (this._exactPattern) {
            if (remainingContent.startsWith(this._exactPattern)) {
                return this._exactPattern;
            }
        }

        return null;
    }

    /**
     * If this token pattern matches an exact string, return that string. Otherwise, return `null`.
     */
    getExpectedTokenContent(): string | null {
        if (this._exactPattern) {
            return this._exactPattern;
        }

        return null;
    }
}

/**
 * Provides patterns for all token types and enables token matching.
 *
 * Call `TokenMatcher.create()` to create a `TokenMatcher` instance fully populated
 * with patterns for all token types.
 */
class TokenMatcher {
    private _tokenPatterns: Map<TokenType, TokenPattern>;

    private constructor() {
        this._tokenPatterns = new Map();
    }

    addTokenPattern(
        tokenType: TokenType,
        opts: { regex?: RegExp; matcher?: MatchFunction; string?: string }
    ): TokenMatcher {
        if (this._tokenPatterns.has(tokenType)) {
            throw new Error(`Token type ${TokenType[tokenType]} already has a pattern`);
        }

        if (sum([opts.matcher, opts.regex, opts.string].map((n) => (n ? 1 : 0)))) {
            throw new Error(
                "Token pattern must have exactly one of a regex pattern OR a matching function"
            );
        }

        if (opts.regex) {
            this._tokenPatterns.set(tokenType, TokenPattern.createWithRegex(tokenType, opts.regex));
        }

        if (opts.matcher) {
            this._tokenPatterns.set(
                tokenType,
                TokenPattern.createWithMatcher(tokenType, opts.matcher)
            );
        }

        if (opts.string) {
            this._tokenPatterns.set(
                tokenType,
                TokenPattern.createWithStringPattern(tokenType, opts.string)
            );
        }

        return this;
    }

    getPattern(tokenType: TokenType): TokenPattern {
        let pattern = this._tokenPatterns.get(tokenType);

        if (!pattern) {
            throw new Error(`Token type ${TokenType[tokenType]} does not have a pattern`);
        }

        return pattern;
    }

    /**
     * Attempt to match each token type to the string `remainingContent` in the order
     * given in `tokenTypes`. Return the token content matched by the first matching
     * token type in `tokenTypes` as well as the type of token matched.
     */
    matchToken(
        remainingContent: string,
        tokenTypes: TokenType[]
    ): { tokenContent: string; type: TokenType } | null {
        for (let tokenType of tokenTypes) {
            let matchedTokenString = this.getPattern(tokenType).match(remainingContent);

            if (matchedTokenString) {
                return { tokenContent: matchedTokenString, type: tokenType };
            }
        }

        return null;
    }

    static populated(): TokenMatcher {
        let pattern = new TokenMatcher();

        return (
            pattern
                .addTokenPattern(TokenType.DiagramBlock, { regex: /^#diagram\b/g })
                .addTokenPattern(TokenType.BlockDeclaration, {regex: /^#(?=\w)/g})
                .addTokenPattern(TokenType.BlockName, {regex: /^\w+/g})
                .addTokenPattern(TokenType.Setting, { regex: /^:(?=\w)\b/g })
                .addTokenPattern(TokenType.SettingName, { regex: /^\w+(?= )\b/g })
                // Matches the remaining string to the end of the line
                .addTokenPattern(TokenType.SettingExpression, { regex: /^.+$/gm })
                .addTokenPattern(TokenType.H1, { string: "# " })
                .addTokenPattern(TokenType.H2, { string: "## " })
                .addTokenPattern(TokenType.H3, { string: "### " })
                .addTokenPattern(TokenType.H4, { string: "#### " })
                .addTokenPattern(TokenType.TextLiteral, { regex: /^./g })
                .addTokenPattern(TokenType.ItalicBegin, { regex: /^\*(?! |\n)/g })
                .addTokenPattern(TokenType.ItalicEnd, { regex: /^\*(?! |\n)/g })
                .addTokenPattern(TokenType.InlineMathModeBegin, { regex: /^\$/g })
                .addTokenPattern(TokenType.InlineMathModeEnd, { regex: /^\$/g })
                .addTokenPattern(TokenType.EOL, { regex: /^\n/g })
                .addTokenPattern(TokenType.EOF, {
                    matcher: (content) => (content.length === 0 ? "" : null),
                })
                .addTokenPattern(TokenType.BlockBegin, { string: "{" })
                .addTokenPattern(TokenType.BlockEnd, { string: "}" })
                .addTokenPattern(TokenType.CodeBegin, { regex: /^```/g })
                .addTokenPattern(TokenType.LangCodeBegin, { regex: /^```\w+/g })
                .addTokenPattern(TokenType.CodeEnd, { string: "```" })
                .addTokenPattern(TokenType.EmbeddedText, { regex: /^./g })
                .addTokenPattern(TokenType.ShorthandInlineMath, { regex: /^!\w+/g })
                .addTokenPattern(TokenType.Comment, { string: "//" })
        );
    }
}

export class LexingError extends Error {
    location: SourceLocation;
    message: string;

    constructor(location: SourceLocation, message: string) {
        super(message);
        this.location = location;
        this.message = message;
    }
}

export class TokenStream {
    private _content: string;
    readonly source: SourceReference;
    private _lines: string[];
    private _cursor: number;
    tokenMatcher: TokenMatcher;

    private _currentLocation: {
        line: number;
        col: number;
    };

    constructor(source: SourceReference) {
        this._content = source.getContent();
        this._lines = this._content.split("\n");
        this._cursor = 0;
        this.source = source;

        this.tokenMatcher = TokenMatcher.populated();

        this._currentLocation = {
            line: 1,
            col: 0,
        };
    }

    /**
     * Return the length of the loaded content in characters.
     */
    get contentLength(): number {
        return this._content.length;
    }

    /**
     * Return the remaining portion of the loaded content that has not yet been
     * consumed.
     */
    getRemainingContent(): string {
        return this._content.slice(this._cursor);
    }

    /**
     * Given a matched token type and token content, return a token instance
     * and update current source location.
     */
    private _consumeToken(tokenType: TokenType, content: string): Token {
        let token = new Token(
            this.source,
            tokenType,
            new SourceLocation(this.source, this._currentLocation.line, this._currentLocation.col),
            content
        );

        if (tokenType === TokenType.EOL || content.includes("\n")) {
            this._currentLocation.line += 1;
            this._currentLocation.col = 0;
        } else {
            this._currentLocation.col += content.length;
        }

        this._cursor += content.length;

        return token;
    }

    getCurrentSourceLocation(): SourceLocation {
        return new SourceLocation(
            this.source,
            this._currentLocation.line,
            this._currentLocation.col
        );
    }

    /**
     * In certain lexing contexts, whitespace should be ignored.
     *
     * If `remainingContent` is prefixed by whitespace (not including newline characters), consume it.
     */
    private _consumeWhitespace(): void {
        let match = this.getRemainingContent().match(/^[ \t]+/g);

        if (match) {
            let whitespace = match[0];

            this._currentLocation.col += whitespace.length;
            this._cursor = whitespace.length;
        }
    }

    nextToken(mode: LexingMode): Token | null {
        if (mode.skipWhitespace) {
            this._consumeWhitespace();
        }

        let match = this.tokenMatcher.matchToken(this.getRemainingContent(), mode.validTokenTypes);

        if (!match) {
            return null;
        }

        return this._consumeToken(match.type, match.tokenContent);
    }

    /**
     * Return an error message for use by the parser if the parser is unable
     * to match any tokens (i.e. we assume that the first character of the remaining content
     * is invalid).
     */
    unexpectedTokenError(expectedCharacter?: string): string {
        let offendingCharacter = this.getRemainingContent()[0];

        if (offendingCharacter === undefined) {
            offendingCharacter = "[EOF]";
        }

        if (offendingCharacter === "\n") {
            offendingCharacter = "[Newline]";
        }

        if (offendingCharacter === "\t") {
            offendingCharacter = "[Tab]";
        }

        let message = `Unexpected character "${offendingCharacter}"`;

        if (expectedCharacter) {
            message += `; expected "${expectedCharacter}"`;
        }

        return message;
    }
}
