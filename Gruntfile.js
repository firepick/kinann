module.exports = function(grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
            },
            build: {
                src: 'www/js/services.js',
                dest: 'target/services.min.js'
            }
        },
        watch: {
            scripts: {
                files: ['**/*.js'],
                options: {
                    spawn: true,
                },
            },
        },
        jshint: {
            all: ['Gruntfile.js', '**/*.js']
        },
        jsbeautifier: {
            files: ["Gruntfile.js", "src/**/*.js", "test/**/*.js"],
            options: {
                wrap_line_length: 50,
                keep_array_indentation: true
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-jsbeautifier');
    grunt.loadNpmTasks('grunt-npm-install');
    grunt.loadNpmTasks('grunt-release');

    // Default task(s).
    grunt.registerTask('default', ['uglify']);

    var customizeJSON = function(original, custom) {
        for (var key in custom) {
            if (custom.hasOwnProperty(key)) {
                if (original.hasOwnProperty(key)) {
                    var customValue = custom[key];
                    var originalValue = original[key];
                    if (typeof customValue === "object" && typeof originalValue == "object") {
                        customizeJSON(originalValue, customValue);
                    } else {
                        original[key] = custom[key];
                    }
                } else {
                    original[key] = custom[key];
                }
            }
        }
    };
};
