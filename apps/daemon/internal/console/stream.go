package console

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"

	"github.com/docker/docker/api/types/filters"
)

// filterByServerId builds a Docker filter for containers labeled with the given server ID.
func filterByServerId(serverId string) filters.Args {
	f := filters.NewArgs()
	f.Add("label", fmt.Sprintf("sigil.server-id=%s", serverId))
	return f
}

// demuxStream reads Docker's multiplexed log format (8-byte header + payload)
// and returns a reader that yields just the payload bytes with stream type info.
type demuxReader struct {
	src     io.Reader
	buf     []byte
	current []byte
	pos     int
	stream  string
}

func demuxStream(src io.Reader) *demuxReader {
	return &demuxReader{
		src: src,
		buf: make([]byte, 8),
	}
}

func (d *demuxReader) Read(p []byte) (int, error) {
	if d.pos >= len(d.current) {
		if err := d.readNextFrame(); err != nil {
			return 0, err
		}
	}

	n := copy(p, d.current[d.pos:])
	d.pos += n
	return n, nil
}

func (d *demuxReader) readNextFrame() error {
	_, err := io.ReadFull(d.src, d.buf)
	if err != nil {
		return err
	}

	// First byte is stream type: 1=stdout, 2=stderr
	switch d.buf[0] {
	case 1:
		d.stream = "stdout"
	case 2:
		d.stream = "stderr"
	default:
		d.stream = "stdout"
	}

	// Next 3 bytes are padding, then 4 bytes big-endian size
	size := binary.BigEndian.Uint32(d.buf[4:8])
	if size == 0 {
		return io.EOF
	}

	d.current = make([]byte, size)
	d.pos = 0
	_, err = io.ReadFull(d.src, d.current)
	return err
}

func (d *demuxReader) Stream() string {
	return d.stream
}

// lineScanner reads lines from a demuxReader and tracks which stream each line came from.
type lineScanner struct {
	scanner *bufio.Scanner
	demux   *demuxReader
}

func newLineScanner(r io.Reader, maxLen int) *lineScanner {
	d := demuxStream(r)
	scanner := bufio.NewScanner(d)
	scanner.Buffer(make([]byte, 0, maxLen), maxLen)
	return &lineScanner{
		scanner: scanner,
		demux:   d,
	}
}

func (l *lineScanner) Scan() bool {
	return l.scanner.Scan()
}

func (l *lineScanner) Text() string {
	return l.scanner.Text()
}

func (l *lineScanner) Stream() string {
	return l.demux.Stream()
}

func (l *lineScanner) Err() error {
	return l.scanner.Err()
}
