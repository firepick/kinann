var mathjs = require("mathjs");

(function(exports) { class Equations {
    constructor (options={}) {
        this.equations = [];
        this.exprs = {};
        this.symbols = {};
        this.nodes = {};
        this.symgen = 0;
        this.node0 = new mathjs.expression.node.ConstantNode(0);
        this.node1 = new mathjs.expression.node.ConstantNode(1);
        this.node2 = new mathjs.expression.node.ConstantNode(2);
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

    simplify(node) {
        if (node.isOperatorNode) {
            var a0 = this.simplify(node.args[0]);
            var a1 = node.args[1] && this.simplify(node.args[1]);
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
            var c = this.simplify(node.content);
            if (c.isParenthesisNode || c.isSymbolNode || c.isConstantNode) {
                return c;
            }
            return new mathjs.expression.node.ParenthesisNode(c);
        } else if (node.isFunctionNode) {
            var args = node.args.map((arg) => this.simplify(arg));
            if (args.length === 1) {
                if (args[0].isParenthesisNode) {
                    args[0] = args[0].content;
                }
            }
            return new mathjs.expression.node.FunctionNode(node.name, args);
        }
        return node;
    }

    nodeDerivative(node, variable) {
        var dnode = null;
        var msg = "";
        if (node.isConstantNode) {
            dnode = new mathjs.expression.node.ConstantNode(0);
        } else if (node.isSymbolNode) {
            if (node.name === variable) {
                dnode = new mathjs.expression.node.ConstantNode(1);
            } else if (this.symbols[node.name]) {
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
            } else if (node.op === "/") { // (vdu-udv)/v^2
                var vdu = new mathjs.expression.node.OperatorNode("*", "multiply", [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode("*", "multiply", [a0, da1]);
                var udvvdu = new mathjs.expression.node.OperatorNode("-", "subtract", [udv, vdu]);
                var vv = new mathjs.expression.node.OperatorNode("^", "pos", [a1,this.node2]);
                var vvname = this.optimize(vv.toString());
                var vvn = new mathjs.expression.node.SymbolNode(vvname);
                dnode = new mathjs.expression.node.OperatorNode("/", "divide", [udvvdu, vvn]);
            } else if (node.op === "^") { // udv+vdu
                if (a1.isConstantNode) {
                    var k = a1.clone();
                    var power = new mathjs.expression.node.ConstantNode(Number(a1.value)-1);
                    var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                    var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                    var prodn = this.optimize(prod.toString());
                    var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                    dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
                }
                var vdu = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a1, da0]);
                var udv = new mathjs.expression.node.OperatorNode(node.op, node.fn, [a0, da1]);
            }
        } else if (node.isFunctionNode) {
            var a0 = node.args[0];
            var da0 = a0 && this.nodeDerivative(a0, variable);
            var a1 = node.args[1];
            var da1 = a1 && this.nodeDerivative(a1, variable);
            if (node.name === "sin") {
                var cos = new mathjs.expression.node.FunctionNode("cos", [a0]);
                var fcos = this.optimize(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [fcosn, da0]);
            } else if (node.name === "cos") {
                var cos = new mathjs.expression.node.FunctionNode("sin", [a0]);
                var fcos = this.optimize(cos.toString());
                var fcosn = new mathjs.expression.node.SymbolNode(fcos);
                var dcos = new mathjs.expression.node.OperatorNode("-", "unaryMinus", [fcosn]);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [dcos, da0]);
            } else if (node.name === "sqrt") {
                var k = new mathjs.expression.node.ConstantNode(1/2);
                var power = new mathjs.expression.node.ConstantNode(1/2-1);
                var a0p = new mathjs.expression.node.OperatorNode("^", "pow", [a0,power]);
                var prod = new mathjs.expression.node.OperatorNode("*", "multiply", [k,a0p]);
                var prodn = this.optimize(prod.toString());
                var prodnn = new mathjs.expression.node.SymbolNode(prodn);
                dnode = new mathjs.expression.node.OperatorNode("*", "multiply", [prodnn, da0]);
            }
        }
        if (dnode == null) {
            throw new Error("nodeDerivative does not support: " + node.type + " " + msg);
        }
        return dnode;
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
    it("TESTTESTsimplify(node) returns simplified node tree", function() {
        var eq = new Equations();
        eq.simplify(mathjs.parse("x-0")).toString().should.equal("x");
        eq.simplify(mathjs.parse("0-x")).toString().should.equal("-x");
        eq.simplify(mathjs.parse("0-3")).toString().should.equal("-3");
        eq.simplify(mathjs.parse("x+0")).toString().should.equal("x");
        eq.simplify(mathjs.parse("0+x")).toString().should.equal("x");
        eq.simplify(mathjs.parse("0*x")).toString().should.equal("0");
        eq.simplify(mathjs.parse("x*0")).toString().should.equal("0");
        eq.simplify(mathjs.parse("x*1")).toString().should.equal("x");
        eq.simplify(mathjs.parse("1*x")).toString().should.equal("x");
        eq.simplify(mathjs.parse("0/x")).toString().should.equal("0");
        eq.simplify(mathjs.parse("(1*x + y*0)*1+0")).toString().should.equal("x");
        eq.simplify(mathjs.parse("sin(x+0)*1")).toString().should.equal("sin(x)");
        eq.simplify(mathjs.parse("((x+0)*1)")).toString().should.equal("x");
        eq.simplify(mathjs.parse("sin((x-0)*1+y*0)")).toString().should.equal("sin(x)");
        eq.simplify(mathjs.parse("((x)*(y))")).toString().should.equal("(x * y)");
    });
})
