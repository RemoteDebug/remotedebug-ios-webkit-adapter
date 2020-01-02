//
// Copyright (C) Microsoft. All rights reserved.
//

'use strict'

const gulp = require('gulp')
const mocha = require('gulp-mocha')
const gtslint = require('gulp-tslint')
const ts = require('gulp-typescript')
const log = require('fancy-log')
const tslint = require('tslint');

const program = tslint.Linter.createProgram("./tsconfig.json", ".");

const shellSources = [
  'src/**/*.ts',
  'test/**/*.ts',
  'test/*.ts',
  'typings/globals/**/*.ts',
  '!src/**/*.json'
]

const lintSources = [
  'src/**/*.ts',
  'test/**/*.ts'
]

let isWatch = false

gulp.task('build', function () {
  var tsProject = ts.createProject('tsconfig.json')
  return gulp.src(shellSources, { base: '' })
    .pipe(tsProject())
    .pipe(gulp.dest('./out'))
})

gulp.task('build-tests', function () {
  const sources = [
    'test/**/*.ts',
    'test/*.ts'
  ]

  var tsProject = ts.createProject('tsconfig.json')
  return gulp.src(shellSources, { base: '' })
    .pipe(tsProject())
    .pipe(gulp.dest('./out/test'))
})

gulp.task('lint', function () {
  return gulp.src(lintSources)
    .pipe(gtslint({
      formatter: 'verbose',
      program: program
    }))
    // .pipe(gtslint.report())
})

gulp.task('test', gulp.series('build-tests', function () {
  process.env.NODE_ENV = 'development'
  return gulp.src('out/test/**/*.test.js', { read: false })
    .pipe(mocha({ ui: 'tdd' }))
    .on('error', function (e) {
      log(e ? e.toString() : 'error in test task!')
      this.emit('end')
    })
}))

gulp.task('watch-test', gulp.series('build-tests', function () {
  return gulp.watch(shellSources, gulp.task('test'))
}))

gulp.task('watch', gulp.series('build', function () {
  const all = shellSources
  gulp.watch(all, gulp.task('build'))
}))
