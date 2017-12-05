#!/bin/sh

# Я удержался от соблазна использования trap'ов, потому что trap'ы в случае любой нештатной ситуации тёрли бы всё, а нам это не нужно. Итак, скрипт работает так: в случае любой нештатной ситуации он может оставить за собой временные файлы. По ним можно восстановить некую информацию. Если выдаётся сообщение "system unchanged" (или usage), значит, действительно, система в исходном состоянии, в противном случае, при любом другом сообщении об ошибке временные файлы могли остаться, и по ним можно попробовать что-то восстановить

# TO DO. Внедрить стандарт для standards support library, es и mks. Кроме пунктов, которые явно помечены как сделанные. После этого написать в коде в нужных местах, что он соответствует стандарту
# TO DO. Проверить standards support library, es и mks на предмет наличия правильных техник работы в режиме set -e, не указанных в стандарте
# TO DO. В standards support library, es и mks протестировать те особенности, которые могут быть разными в bash и dash
# TO DO. Выяснить список зависимостей standards support library, es и mks. На основе него проверить список assert'ов в коде и конфиг для менеджера пакетов

{
	set -e

	. sh201708.sh

	usage(){
		cat << EOF
Usage: ${0##*/} [--] ARCHIVE
Not exception safe
EOF
	}

	while [ "${1#-}" != "$1" ]; do
		case "$1" in
			"--help")
				usage
				exit 0
				;;
			"--")
				shift
				break
				;;
			*)
				usage >&2
				exit 1
				;;
		esac
	done

	[ $# != 1 ] && usage >&2 && exit 1

	U_ORIG_ARCHIVE="$1"
	ARCHIVE="$(sh201708_to_safe -- "$U_ORIG_ARCHIVE")"

	sh201708_assert_cmd -- readlink
	sh201708_assert_cmd -- sync
	sh201708_assert_cmd -- mktemp
	sh201708_assert_cmd -- unzip
	sh201708_assert_cmd -- emacs
	sh201708_assert_cmd -- zip

	(
		# subshell, чтобы не засорять environment
		# as-secret-* в ~, чтобы туда мог записать юзер. Не в /tmp и не в /var/tmp, т. к. там ненадёжно. Файлы не скрыты, чтобы их сразу было видно. Не в отдельной папке, чтобы их сразу было видно. Имя: as-secret, так я выбрал. Имя: as-secret, чтобы длинное и достаточно уникальное, сам скрипт сохраняет название es, т. к. я так привык. Я сделал их файлами, т. к. так проще. Да, возникает временной промежуток, когда файл уже создан, но ещё не открыт как нужный файловый дескриптор, но ничего страшного тут нет
		for I in ~/as-secret-*; do
			if ! [ -e "$I" ]; then
				break
			fi

			PID="$(cat -- "$I")"

			# In case of error readlink prints nothing
			FILE="$(readlink -f -- "/proc/$PID/fd/3" || printf -- '%s\n' "fail")"

			if [ "$FILE" != "$I" ]; then
				printf -- '%s\n' "${0##*/}: there is a PID file, but there no process, seems your latest reboot was unclean; system unchanged" >&2
				exit 1
			fi
		done
	)

	[ "${ARCHIVE%.zip}" = "$ARCHIVE" ] && printf -- '%s\n' "${0##*/}: $U_ORIG_ARCHIVE: not a *.zip; system unchanged" >&2 && exit 1

	# Нужно проверить, иначе unzip будет искать файлы с похожими именами, а sync не сможет найти файловую систему, соответствующую файлу
	if ! [ -f "$ARCHIVE" ]; then
		printf -- '%s\n' "${0##*/}: $U_ORIG_ARCHIVE: not exists or not a regular file; system unchanged" >&2
		exit 1
	fi

	# Сперва нужно залочить сам файл
	ARCHIVE_DN="$(sh201708_dirname -- "$ARCHIVE")"
	U_ARCHIVE_BN="$(u_sh201708_basename -- "$ARCHIVE")"
	LOCK="$ARCHIVE_DN/.$U_ARCHIVE_BN.as-secret.lock"
	! mkdir -- "$LOCK" && printf -- '%s\n' "${0##*/}: info: system unchanged" >&2 && exit 1

	PID_FILE="$(mktemp -- ~/as-secret-XXXXXX)"

	printf -- '%s\n' $$ > "$PID_FILE"

	exec 3< "$PID_FILE"

	# Дополнительный subshell, чтобы больше не держать 3-й файловый дескриптор
	(
		exec 3<&-

		clean_up(){
			# Удаления должны быть за'sync'аны, чтобы не возникало ложных опасений, что что-то не так
			rm -- "$PID_FILE"
			rm -r -- "$LOCK"
			printf -- '%s' "${0##*/}: info: syncing... " >&2
			sync -f -- ~
			sync -f -- "$ARCHIVE"
			printf -- '%s\n' "done" >&2
		}

		if ! unzip -qd "$LOCK" "$ARCHIVE"; then
			clean_up
			printf -- '%s\n' "${0##*/}: info: если после нескольких неправильных попыток ввода пароля ничего не было выдано, значит, все пароли неправильные; system unchanged" >&2
			exit 1
		fi

		CONTENT="$(cd -- "$LOCK"; printf -- '%s ' .* *)"

		if [ "$CONTENT" != ". .. txt.txt " ]; then
			clean_up
			printf -- '%s\n' "${0##*/}: $U_ORIG_ARCHIVE: the archive should have only one file: txt.txt; system unchanged" >&2
			exit 1
		fi

		emacs -- "$LOCK/txt.txt"

		# Теперь emacs за'sync'ал $LOCK/txt.txt

		if ! [ "$LOCK/txt.txt" -nt "$ARCHIVE" ]; then
			clean_up
			exit 0
		fi

		while ! zip --encrypt --junk-paths --quiet "$ARCHIVE" "$LOCK/txt.txt"; do
			printf -- '%s\n' "${0##*/}: info: try again; если zip выдал ошибку \"Invalid command arguments (password verification failed)\", значит, пароль повторён неверно" >&2
			sleep -- 1
		done

		clean_up
	)

	exit 0
}
