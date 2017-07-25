#!/bin/bash
# It's really better to use "mktemp ~"
# Нельзя запустить несколько утилит одновременно, т. к. существуют ~/s-*

# Use traps in es, mks, etc!
# Хорошо бы запускать редактор в screen'е или чём-то таком, чтобы (даже если это ase) ничего не осталось в scroll-back

set -e

[ -e ~/s-* ] && echo "${0##*/}: there are ~/s-*" >&2 && exit 1

[ $# != 1 ] && echo "Usage: ${0##*/} FILE" >&2 && exit 1

! [[ "$1" =~ \.zip$ ]] && echo "${0##*/}: $1: wrong extension" >&2 && exit 1

DIR="$(mktemp -dp ~ s-XXXXXXXXXX)"
! unzip -q "$1" -d "$DIR" && rmdir "$DIR" && exit 1

if ! [ "$(ls -A "$DIR")" = txt.txt ]; then
	echo "${0##*/}: $1: archive must contain file \"txt.txt\" only" >&2
	rm -r "$DIR"
	exit 1
fi

# emacs правильно sync'ает файл
if ! emacs -- "$DIR/txt.txt"; then
	echo "${0##*/}: $1: editing failed, archive is not changed, modified file is \"$DIR/txt.txt\"" >&2
	exit 1
fi

if [ "$DIR/txt.txt" -nt "$1" ]; then
	# В этом месте sync не нужен, т. к. emacs всё за'sync'ал

	if ! zip -ejq "$1" "$DIR/txt.txt"; then
		if ! zip -ejq "$1" "$DIR/txt.txt"; then
			echo "${0##*/}: $1: compressing failed, archive is not changed, modified file is \"$DIR/txt.txt\"" >&2
			exit 1
		fi
	fi
fi

rm -r "$DIR"

printf "Syncing... "
sync -f ~
sync "$1"
printf "done\n"
