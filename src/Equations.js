var mathjs = require("mathjs");

(function(exports) { class Equations {
    constructor (options={}) {
        this.equations = [];
        this.exprs = {};
        this.symbols = {};
        this.nodes = {};
        this.symgen = 0;
    }

    toJSON() {
        return {
            type: "Equations",
            equations: this.equations,
        }
    }

    createSymbol() {
        return "_" + ++this.symgen;
    }

    bindNode(symbol, node) {
        this.nodes[symbol] = node;
        var expr = node.toString();
        this.exprs[expr] = symbol;
        this.symbols[symbol] = expr;
        return symbol;
    }

    digest(node) {
        if (node.isConstantNode) {
            return this.exprs[node.value] || this.bindNode(this.createSymbol(), node);
        } else if (node.isSymbolNode) {
            return node.name;
        } else if (node.isOperatorNode) {
            var args = node.args.map((arg) => this.digest(arg));
            var nexpr = args.join(node.op);
            var digestedNode = mathjs.parse(nexpr);
            nexpr = digestedNode.toString(); // normalize
            return this.exprs[nexpr] || this.bindNode(this.createSymbol(), digestedNode);
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.digest(arg));
            var nexpr = node.name + "(" + args.join(",") + ")";
            var digestedNode = mathjs.parse(nexpr);
            nexpr = digestedNode.toString(); // normalize
            return this.exprs[nexpr] || this.bindNode(this.createSymbol(), digestedNode);
        } else if (node.isParenthesisNode) {
            return this.digest(node.content);
        } else {
            throw new Error("TBD digest("+node.type+")");
        }
    }

    undigest(node) {
        if (node.isConstantNode) {
            return node;
        } else if (node.isSymbolNode) {
            return node.name[0] === "_" && this.undigest(this.nodes[node.name]) || node;
        } else if (node.isOperatorNode) {
            return new mathjs.expression.node.OperatorNode(node.op, node.fn, 
                node.args.map((n) => this.undigest(n))
            );
        } else if (node.isFunctionNode) {
            return new mathjs.expression.node.FunctionNode(node.name,
                node.args.map((n) => this.undigest(n))
            );
        } else {
            throw new Error("TBD undigest"+node.toString()+" "+node);
        }
    }

    set(symbol, expr) {
        (typeof expr === "number") && (expr = "" + expr);
        if (typeof symbol !== "string") {
            throw new Error("Invalid call to set(symbol, expr): symbol must be string");
        }
        if (typeof expr !== "string") {
            throw new Error("Invalid call to set(symbol, expr): expr must be string");
        }
        this.equations.push(symbol + "=" + expr);
        var root = mathjs.parse(expr);
        var digestedSym = this.digest(root);
        this.bindNode(symbol, this.nodes[digestedSym]);
        this.symbols[symbol] = digestedSym;
        return symbol;
    }

    get(symbol) {
        var node = this.nodes[symbol];
        return node && this.undigest(node).toString(); // mathjs puts in parenthesis (yay!)
    }

} // CLASS

    module.exports = exports.Equations = Equations;
})(typeof exports === "object" ? exports : (exports = {}));


(typeof describe === 'function') && describe("Equations", function() {
    var should = require("should");
    var Equations = exports.Equations;
    var https = require("https");
    var fs = require("fs");
    var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g," ");

    it("TESTTESTset(sym,expr) and get(sym) define and retrieve named expressions", function() {
        var root = mathjs.parse("y=m*x+b");
        var eq = new Equations();
        eq.set("PI", mathjs.PI).should.equal("PI");
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.set("y", "m*x+b").should.equal("y");
        eq.get("y").should.equal("m * x + b"); 
        eq.set("z", "sin(m*x+b)").should.equal("z");
        eq.get("z").should.equal("sin(y)"); // not "sin(m * x + b)" !
        eq.set("mx", "m*x").should.equal("mx");

        // definitions don't change
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.get("y").should.equal("m * x + b"); 

        // sub-expressions
        eq.get("_1").should.equal(""+mathjs.PI);
        eq.get("_2").should.equal("m * x"); 
        eq.get("_3").should.equal("m * x + b"); 
        eq.get("_4").should.equal("sin(y)"); 

        eq.set("zz", "sin(m*x+PI)/cos((m*x + b)^2)").should.equal("zz");
        eq.get("zz").should.equal("sin(mx + PI) / cos((mx + b) ^ 2)"); // note that mx is used instead of "m*x"

        var eq = new Equations();
        eq.set("y", "(x+1)/(x-1)").should.equal("y");
        eq.get("y").should.equal("(x + 1) / (x - 1)"); // mathjs puts in parentheses

        var eq = new Equations();
        var msStart = new Date();
        eq.set("gist", gist.toString()).should.equal("gist");
        console.log("gist ms:", new Date() - msStart);
        //console.log("eq", eq.symbols);
    });
})
