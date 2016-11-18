//
// Copyright (C) Microsoft. All rights reserved.
//

'use strict';

const gulp = require('gulp');
const mocha = require('gulp-mocha');
const sourcemaps = require('gulp-sourcemaps');
const tslint = require('gulp-tslint');
const ts = require('gulp-typescript');
const log = require('gulp-util').log;
const typescript = require('typescript');
const fs = require('fs');
const path = require('path');

const shellSources = [
    'src/**/*',
    'test/**/*.ts',
    'test/*.ts',
    'typings/globals/**/*.ts'
];

const lintSources = [
    'src/**/*.ts',
    'test/**/*.ts'
];

let isWatch = false;

gulp.task('build', function () {
    const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
    const projectConfig = tsConfig.compilerOptions;
    return gulp.src(shellSources, { base: '' })
        .pipe(sourcemaps.init())
        .pipe(ts(projectConfig)).js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: __dirname + '/'}))
        .pipe(gulp.dest('./out'));
});

gulp.task('build-tests', function () {
    const sources = [
        'test/**/*.ts',
        'test/*.ts',
    ];

    const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
    const projectConfig = tsConfig.compilerOptions;
    return gulp.src(sources, { base: '' })
        .pipe(sourcemaps.init())
        .pipe(ts(projectConfig)).js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: __dirname + '/'}))
        .pipe(gulp.dest('./out/test'));
});

gulp.task('lint', function () {
    console.log(lintSources)
    return gulp.src(lintSources)
        .pipe(tslint({formatter: "full"}))
        .pipe(tslint.report('verbose'));
});

gulp.task('test', ['build-tests'], function() {
    process.env.NODE_ENV = 'development';
    return gulp.src('out/test/**/*.test.js', { read: false })
        .pipe(mocha({ ui: 'tdd' }))
        .on('error', function(e) {
            log(e ? e.toString() : 'error in test task!');
            this.emit('end');
        });
});

gulp.task('watch-test', ['build-tests'], function() {
     return gulp.watch(shellSources, ['build-tests']);
});

gulp.task('watch', ['build'], function () {
    const all = shellSources;
    gulp.watch(all, ['build']);
});
