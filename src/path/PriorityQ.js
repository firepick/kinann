var mathjs = require("mathjs");

(function(exports) { 
    class PriorityQ {
        constructor(options = {}) {
            this.values = [];
            this.min = null;
            this.compare = options.compare || ((a,b) => (a-b));
        }

        insertMin(value, tree) {
            if (tree == null) {
                return [value];
            }
            if (this.compare(value, tree[0]) <= 0) {
                return [value,tree];
            } else {
                tree[1] = this.insertMin(value, tree[1]);
                return tree;
            }
        }

        insert(value) {
            this.min = this.insertMin(value, this.min);
        }

        extractMin() {
            if (this.min == null) {
                return null;
            }
            var result = this.min[0];
            this.min = this.min[1];
            return result;
        }

        get length() {
            return this.values.length;
        }
    }

    module.exports = exports.PriorityQ = PriorityQ;
})(typeof exports === "object" ? exports : (exports = {}));

(typeof describe === 'function') && describe("PriorityQ", function() {
    var should = require("should");
    var PriorityQ = exports.PriorityQ;

    it("PriorityQ(options) can have a custom comparator", function() {
        var pq = new PriorityQ({
            compare: (a,b) => a.value - b.value,
        });
        pq.insert({value:10});
        pq.insert({value:5});
        pq.insert({value:1});
        pq.insert({value:5});
        pq.extractMin().value.should.equal(1);
        pq.extractMin().value.should.equal(5);
        pq.extractMin().value.should.equal(5);
        pq.extractMin().value.should.equal(10);
    })
    it("insert() should increase length", function() {
        var pq = new PriorityQ();
        pq.length.should.equal(0);
        pq.insert(10);
        pq.insert(1);
        pq.insert(5);
    })
    it("extractMin() removes and returns smallest element", function() {
        var pq = new PriorityQ();
        pq.insert(10);
        pq.insert(5);
        pq.insert(1);
        pq.insert(5);
        pq.extractMin().should.equal(1);
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(5);
        pq.extractMin().should.equal(10);
        should(pq.extractMin()).equal(null);
    })
    it("insertMin(value, tree) insert value into tree", function() {
        var pq = new PriorityQ();
        var tree = pq.insertMin(10);
        should.deepEqual(tree, [10]);
        var tree = pq.insertMin(5, tree);
        should.deepEqual(tree, [5, [10]]);
        var tree = pq.insertMin(1, tree);
        should.deepEqual(tree, [1,[5, [10]]]);
        var tree = pq.insertMin(5, tree);
        should.deepEqual(tree, [1,[5, [5, [10]]]]);
    })
})
