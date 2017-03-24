var mathjs = require("mathjs");
// TODO: n-ary OperatorNode
// TODO: compile()
// TODO: eval()
// TODO: derivative of all mathjs functions

(function(exports) { class Equations {
    constructor (options={}) {
        this.symbolOfExpr = {};
        this.exprOfSymbol = {};
        this.nodeOfSymbol = {};
        this.symgen = 0;
        this.simplify = options.simplify || this.fastSimplify;
        this.node0 = new mathjs.expression.node.ConstantNode(0);
        this.bindNode("0", this.node0); // pre-defined symbol
        this.node1 = new mathjs.expression.node.ConstantNode(1);
        this.bindNode("1", this.node1); // pre-defined symbol
        this.nodem1 = new mathjs.expression.node.ConstantNode(-1);
        this.bindNode("-1", this.nodem1); // pre-defined symbol
        this.node2 = new mathjs.expression.node.ConstantNode(2);
        //this.bindNode("2", this.node2); // pre-defined symbol
    }

    toJSON() {
        return {
            type: "Equations",
            equations: this.exprOfSymbol,
        }
    }

    generateSymbol() {
        return "_" + ++this.symgen;
    }

    bindNode(symbol, node) {
        this.nodeOfSymbol[symbol] = node;
        var expr = node.toString();
        this.symbolOfExpr[expr] == null && (this.symbolOfExpr[expr] = symbol);
        this.exprOfSymbol[symbol] = expr;
        return symbol;
    }

    fastSimplify(node) { // over 200x faster than mathjs.simplify
        if (node.isOperatorNode) {
            var a0 = this.fastSimplify(node.args[0]);
            var a1 = node.args[1] && this.fastSimplify(node.args[1]);
            if (node.op === "+") {
                if (a0.isConstantNode && a0.value === "0") {
                    return a1;
                }
                if (a1.isConstantNode && a1.value === "0") {
                    return a0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0,a1]);
            } else if (node.op === "-") {
                if (a0.isConstantNode && a0.value === "0") {
                    if (a1) {
                        return a1.isConstantNode 
                            ? new mathjs.expression.node.ConstantNode(-Number(a1.value))
                            : new mathjs.expression.node.OperatorNode("-", "unaryMinus", [a1]);
                    }
                }
                if (node.fn === "subtract") {
                    if (a1.isConstantNode && a1.value === "0") {
                        return a0;
                    }
                    return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0,a1]);
                } else if (node.fn === "unaryMinus") {
                    return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0]);
                }
            } else if (node.op === "*") {
                if (a0.isConstantNode && a0.value === "0") {
                    return this.node0;
                }
                if (a1.isConstantNode && a1.value === "0") {
                    return this.node0;
                }
                if (a0.isConstantNode && a0.value === "1") {
                    return a1;
                }
                if (a1.isConstantNode && a1.value === "1") {
                    return a0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } else if (node.op === "/") {
                if (a0.isConstantNode && a0.value === "0") {
                    return this.node0;
                }
                return new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, a1]);
            } 
        } else if (node.isParenthesisNode) {
            var c = this.fastSimplify(node.content);
            if (c.isParenthesisNode || c.isSymbolNode || c.isConstantNode) {
                return c;
            }
            return new mathjs.expression.node.ParenthesisNode(c);
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.fastSimplify(arg));
            if (args.length === 1) {
                if (args[0].isParenthesisNode) {
                    args[0] = args[0].content;
                }
            }
            return new mathjs.expression.node.FunctionNode(node.name, args);
        }
        return node;
    }

    derivative(expr, variable) {
        var exprTree = mathjs.parse(expr);
        var symbol = this.digestNode(exprTree);
        var dsymbol = symbol + "_d" + variable;
        var dexpr = this.exprOfSymbol[dsymbol];

        if (dexpr == null) {
            var node = this.nodeOfSymbol[symbol];
            if (node == null) {
                if (exprTree.isSymbolNode) {
                    return variable === expr ? "1" : "0"; 
                }
                throw new Error("Unknown symbol:" + symbol);
            }
            var dnode = this.nodeDerivative(node, variable);
            dnode = this.fastSimplify(dnode);
            dexpr = dnode.toString();
            var dexprSymbol = this.digestExpr(dexpr);
            this.exprOfSymbol[dsymbol] = dexprSymbol;
            this.nodeOfSymbol[dsymbol] = this.nodeOfSymbol[dexprSymbol];
        }

        return dsymbol;
    }

    nodeDerivative(node, variable) {
        var dnode = null;
        var msg = "";
        if (node.isConstantNode) {
            dnode = new mathjs.expression.node.ConstantNode(0);
        } else if (node.isSymbolNode) {
            if (node.name === variable) {
                dnode = new mathjs.expression.node.ConstantNode(1);
            } else if (this.exprOfSymbol[node.name]) {
                var dname = this.derivative(node.name, variable);
                dnode = new mathjs.expression.node.SymbolNode(dname);
            } else {
                dnode = new mathjs.expression.node.ConstantNode(0);
            }
        } else if (node.isParenthesisNode) {
            dnode = new mathjs.expression.node.ParenthesisNode(
                this.nodeDerivative(node.content, variable));
        } else if (node.isOperatorNode) {
            var a0 = node.args[0];
            var a1 = node.args[1];
            var da0 = this.nodeDerivative(a0, variable);
            var da1 = a1 && this.nodeDerivative(a1, variable);
            msg = node.op;
            if (node.op === "+") {
                if (node.args[0].isConstantNode) {
                    dnode = da1;
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else if (a0.isSymbolNode && a0.name !== variable) {
                    dnode = da1;
                } else if (a1.isSymbolNode && a1.name !== variable) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "-") {
                if (a1 == null) {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0]);
                } else if (a1.isConstantNode) {
                    dnode = da0;
                } else if (a1.isSymbolNode && a1.name !== variable) {
                    dnode = da0;
                } else {
                    dnode = new mathjs.expression.node.OperatorNode(node.op, node.fn, [da0,da1]);
                }
            } else if (node.op === "*") { // udv+vdu
                var vdu = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, da1]);
                dnode = new mathjs.expression.node.OperatorNode("+", "add", [udv, vdu]);
            } else if (node.op === "/") { // d(u/v) = (vdu-udv)/v^2
                var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode("*", "multiply", [a0, da1]);
                var vduudv = new mathjs.expression.node.OperatorNode("-", "subtract", [vdu, udv]);
                var vv = new mathjs.expression.node.OperatorNode("^", "pos", [a1,this.node2]);
                var vvname = this.digestExpr(vv.toString());
                var vvn = new mathjs.expression.node.SymbolNode(vvname);
                dnode = new mathjs.expression.node.OperatorNode("/", "divide", [vduudv, vvn]);
            } else if (node.op === "^") { // udv+vdu
                var exponent = a1;
                var dexponent = da1;
                if (exponent.isSymbolNode) {
                    var symNode = this.nodeOfSymbol[exponent.name];
                    exponent = symNode || exponent;
                }
                if (exponent != a1) {
                    dexponent = this.nodeDerivative(exponent, variable);
                }
                if (exponent.isConstantNode) {
                    var power = new mathjs.expression.node.ConstantNode(Number(exponent.value)-1);
                    var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                    var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [exponent,a0p]);
                    var prodn = this.digestExpr(prod.toString());
                    var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                    dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
                } else { // d(u^v) = (u^v)*dv*ln(u) + (u^(g-1))*vdu
                    var uv = node;
                    var u = a0;
                    var v = a1;
                    var dv = da1;
                    var du = da0;
                    var lnu = new mathjs.expression.node.FunctionNode("ln", [u]);
                    var dvlnu = new mathjs.expression.node.OperatorNode("*", "multiply", [dv, lnu]);
                    var uvdvlnu = new mathjs.expression.node.OperatorNode("*", "multiply", [uv, dvlnu]);
                    var v1 = new mathjs.expression.node.OperatorNode("-", "subtract", [v,this.node1]);
                    var uv1 = new mathjs.expression.node.OperatorNode("^", "pow", [u,v1]);
                    var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [v, du]);
                    var uv1vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [uv1, vdu]);
                    dnode = new mathjs.expression.node.OperatorNode("+", "add", [uvdvlnu, uv1vdu]);
                }
            }
        } else if (node.isFunctionNode) {
            var a0 = node.args[0];
            var da0 = a0 && this.nodeDerivative(a0, variable);
            var a1 = node.args[1];
            var da1 = a1 && this.nodeDerivative(a1, variable);
            if (node.name === "sin") {
                var cos = new mathjs.expression.node.FunctionNode("cos", [a0]);
                var fcos = this.digestExpr(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fcosn, da0]);
            } else if (node.name === "cos") {
                var cos = new mathjs.expression.node.FunctionNode("sin", [a0]);
                var fcos = this.digestExpr(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                var dcos = new mathjs.expression.node.OperatorNode("-", "unaryMinus", [fcosn]);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [dcos, da0]);
            } else if (node.name === "sqrt") {
                var k = new mathjs.expression.node.ConstantNode(1/2);
                var power = new mathjs.expression.node.ConstantNode(1/2-1);
                var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                var prodn = this.digestExpr(prod.toString());
                var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
            } else {
                throw new Error("TBD derivative(" +node.name+ ")");
            }
        }
        if (dnode == null) {
            throw new Error("nodeDerivative does not support: " + node.type + " " + msg);
        }
        return dnode;
    }

    digestNode(node) {
        if (node.isConstantNode) {
            return this.digestExpr(node.value);
        } else if (node.isSymbolNode) {
            return node.name;
        } else if (node.isOperatorNode) {
            var args = node.args.map((arg) => this.digestNode(arg));
            return this.digestExpr(args.join(node.op));
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.digestNode(arg));
            return this.digestExpr(node.name + "(" + args.join(",") + ")");
        } else if (node.isParenthesisNode) {
            return this.digestNode(node.content);
        } else {
            throw new Error("TBD digestNode("+node.type+")");
        }
    }

    digestExpr(simpleExpr) {
        var digestedNode = mathjs.parse(simpleExpr);
        var normalizedExpr = digestedNode.toString(); 
        return this.symbolOfExpr[normalizedExpr] || 
            this.bindNode(this.generateSymbol(), digestedNode);
    }

    undigestNode(node) {
        if (node.isConstantNode) {
            return node;
        } else if (node.isSymbolNode) {
            return node.name[0] === "_" && this.undigestNode(this.nodeOfSymbol[node.name]) || node;
        } else if (node.isOperatorNode) {
            return new mathjs.expression.node.OperatorNode(node.op, node.fn, 
                node.args.map((n) => this.undigestNode(n))
            );
        } else if (node.isFunctionNode) {
            return new mathjs.expression.node.FunctionNode(node.name,
                node.args.map((n) => this.undigestNode(n))
            );
        } else if (node.isParenthesisNode) {
            return new mathjs.expression.node.ParenthesisNode(this.undigestNode(node.content));
        } else {
            throw new Error("TBD undigest"+node.toString()+" "+node.type);
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
        var root = mathjs.parse(expr);
        var digestedSym = this.digestNode(root);
        this.bindNode(symbol, this.nodeOfSymbol[digestedSym]);
        //this.exprOfSymbol[symbol] = digestedSym;
        this.symbolOfExpr[this.exprOfSymbol[symbol]] = symbol;
        return symbol;
    }

    get(symbol) {
        var node = this.nodeOfSymbol[symbol];
        if (node == null) {
            return symbol; // undefined symbol is just itself
        }

        var tree = this.undigestNode(node);
        if (!tree) {
            throw new Error("undigest(" +symbol+ ") failed:");
        }
        return this.simplify(tree).toString();
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

        eq.get("0").should.equal("0"); // pre-defined symbol
        eq.get("1").should.equal("1"); // pre-defined symbol

        // if equations are set in dependency order, then symbols will automatically be inserted into get
        eq.set("PI", mathjs.PI).should.equal("PI");
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.set("mx", "m*x").should.equal("mx");
        eq.set("y", "m*x+b").should.equal("y");
        eq.get("y").should.equal("mx + b");  // not "sin(m*x + b)" !
        eq.set("z", "sin(m*x+b)").should.equal("z");
        eq.get("z").should.equal("sin(y)"); // not "sin(m * x + b)" !

        // definitions don't change
        eq.get("PI").should.equal(""+mathjs.PI);
        eq.get("y").should.equal("mx + b"); 

        // sub-expressions
        eq.get("_1").should.equal(""+mathjs.PI);
        eq.get("_2").should.equal("m * x"); 
        eq.get("_3").should.equal("mx + b"); 
        eq.get("_4").should.equal("sin(y)"); 

        eq.set("zz", "sin(m*x+PI)/cos((m*x + b)^2)").should.equal("zz");
        eq.get("zz").should.equal("sin(mx + PI) / cos(y ^ 2)"); // note that y is used instead of "m*x+b"

        var eq = new Equations();
        eq.set("y", "(x+1)/(x-1)").should.equal("y");
        eq.get("y").should.equal("(x + 1) / (x - 1)"); // mathjs puts in parentheses

        var eq = new Equations();
        var msStart = new Date();
    });
    it("TESTTESTfastSimplify(node) returns simplified node tree", function() {
        var eq = new Equations();
        eq.fastSimplify(mathjs.parse("x-0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0-x")).toString().should.equal("-x");
        eq.fastSimplify(mathjs.parse("0-3")).toString().should.equal("-3");
        eq.fastSimplify(mathjs.parse("x+0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0+x")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0*x")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("x*0")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("x*1")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("1*x")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("0/x")).toString().should.equal("0");
        eq.fastSimplify(mathjs.parse("(1*x + y*0)*1+0")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("sin(x+0)*1")).toString().should.equal("sin(x)");
        eq.fastSimplify(mathjs.parse("((x+0)*1)")).toString().should.equal("x");
        eq.fastSimplify(mathjs.parse("sin((x-0)*1+y*0)")).toString().should.equal("sin(x)");
        eq.fastSimplify(mathjs.parse("((x)*(y))")).toString().should.equal("(x * y)");
    });
    it("TESTTESTderivative(expr, variable) generates derivative of constant and variable", function() {
        var eq = new Equations();

        // derivative of symbol
        eq.set("f1", "3");
        var dsym = eq.derivative("f1", "x");
        dsym.should.equal("f1_dx");
        eq.get(dsym).should.equal("0");

        // derivative of expression generates symbol as required
        var dsym = eq.derivative("y", "x");
        dsym.should.equal("0");  // pre-defined symbol

        var dsym = eq.derivative("x", "x");
        dsym.should.equal("1"); // pre-defined symbol
    });
    it("TESTTESTderivative(fname, variable) generates derivative of sum", function() {
        var eq = new Equations();

        eq.set("f1", "3+(x+y)");
        var dfname = eq.derivative("f1", "x");
        dfname.should.equal("f1_dx")
        eq.get(dfname).should.equal("1");

        return; // TODO

        var opteval = eq.compile();
        var scope = {
            x: 31,
            y: 27,
        };
        var result = opteval(scope);
        should.deepEqual(scope, {
            f0: 58,
            f0_dx: 1,
            f1: 61,
            f1_dx: 1,
            x: 31,
            y: 27,
        });
    });
    it("TESTTESTderivative(fname, variable) generates derivative of difference", function() {
        var eq = new Equations();
        eq.get(eq.derivative("x-y", "x")).should.equal("1");
        eq.get(eq.derivative("x-y", "y")).should.equal("-1");
        eq.get(eq.derivative("x-4", "y")).should.equal("0");
        eq.get(eq.derivative("4-x", "x")).should.equal("-1");
    });
    it("TESTTESTEquations.derivative(fname, variable) generates derivative of product", function() {
        var eq = new Equations();
        eq.get(eq.derivative("2*x", "x")).should.equal("2");
        eq.get(eq.derivative("2*x", "y")).should.equal("0");
        eq.get(eq.derivative("y*3", "y")).should.equal("3");
        eq.get(eq.derivative("x*y", "x")).should.equal("y");
        eq.get(eq.derivative("x*y", "y")).should.equal("x");
        eq.get(eq.derivative("((x+1)*(x+2))", "x")).should.equal("x + 1 + x + 2"); // fastSimplify 

        var eq = new Equations({
            simplify: mathjs.simplify
        });
        eq.get(eq.derivative("((x+1)*(x+2))", "x")).should.equal("2 * x + 3"); // mathjs simplify
    });
    it("TESTTESTderivative(fname, variable) generates derivative of quotient", function() {
        var eq = new Equations();
        eq.get(eq.derivative("x/y", "x")).should.equal("y / y ^ 2"); 
        eq.get(eq.derivative("x/y", "y")).should.equal("-x / y ^ 2"); 

        var eq = new Equations({
            simplify: mathjs.simplify,
        });
        eq.get(eq.derivative("x/y", "x")).should.equal("1 / y"); 
        eq.get(eq.derivative("x/y", "y")).should.equal("-(x / y ^ 2)"); 
    });
    it("TESTTESTderivative(fname, variable) generates derivative of exponents", function() {
        var eq = new Equations({
            simplify: mathjs.simplify, // make it pretty
        });

        eq.get(eq.derivative("(2*x)^3", "x")).should.equal("6 * (2 * x) ^ 2"); 
        eq.get(eq.derivative("sqrt(2*x)", "x")).should.equal("(2 * x) ^ (-1 / 2)"); 
        //mathjs.derivative("3^sin(2*x)", "x").should.equal("3 ^ sin(2 * x) * cos(2 * x) * 2 * ln(3)"); // invalid symbol in rule: e

        var eq = new Equations();
        eq.get(eq.derivative("3^sin(2*x)", "x")).should.equal("3 ^ sin(2 * x) * cos(2 * x) * 2 * ln(3)"); 
    });
    it("TESTTESTderivative(fname, variable) generates derivative of trigonometric functions", function() {
        var eq = new Equations();
        eq.get(eq.derivative("sin(2*x+1)", "x")).should.equal("cos(2 * x + 1) * 2"); 
        eq.get(eq.derivative("cos(2*x+1)", "x")).should.equal("-sin(2 * x + 1) * 2"); 
    });
    it("TESTTESTgist computes quickly", function() {
        var eq = new Equations();
        var gist = fs.readFileSync("test/rotarydeltax.json").toString().replace(/\n/g," ").toString();

        var msStart = new Date();
        var gistTree = mathjs.parse(gist);
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(200); // typically ~17ms

        //var msStart = new Date();
        //mathjs.simplify(gistTree);
        //console.log("simplify ms", new Date() - msStart); // typically ~1600ms

        var msStart = new Date();
        eq.fastSimplify(gistTree);
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(100); // typically ~5ms

        var msStart = new Date();
        eq.set("gist", gist).should.equal("gist");
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(1000); // typically ~63
        //console.log("set:", new Date() - msStart);

        var msStart = new Date();
        var dfname = eq.derivative("gist", "rf");
        var msElapsed = new Date() - msStart;
        msElapsed.should.below(200); // typically ~10ms
        //console.log("derivative ms:", msElapsed);
    })
})