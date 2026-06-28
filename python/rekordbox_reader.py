#!/usr/bin/env python3
"""
Rekordbox 6/7 database reader using pyrekordbox.
Called from Electron main process via child_process.
Outputs a single JSON object to stdout (all warnings/errors go to stderr).

Install: pip3 install pyrekordbox
"""
import sys
import json
import os
from pathlib import Path
from typing import Optional

# Silence all Python logging so only our JSON goes to stdout
import logging
logging.disable(logging.CRITICAL)

try:
    # Redirect loguru (used by pyrekordbox) to stderr at ERROR level only
    try:
        from loguru import logger as _loguru
        _loguru.remove()
        _loguru.add(sys.stderr, level="ERROR")
    except ImportError:
        pass

    from pyrekordbox.db6 import Rekordbox6Database
    from sqlalchemy import text
except ImportError as e:
    print(json.dumps({"error": f"pyrekordbox not installed. Run: pip3 install pyrekordbox\n{e}"}))
    sys.exit(1)


DB_SEARCH_PATHS = [
    Path.home() / "Library/Pioneer/rekordbox/master.db",
    Path.home() / "Library/Application Support/AlphaTheta/rekordbox/master.db",
    Path.home() / "Library/Application Support/Pioneer/rekordbox/master.db",
    Path.home() / "Library/Application Support/Pioneer/rekordbox6/master.db",
]


def find_db_path() -> Optional[str]:
    for p in DB_SEARCH_PATHS:
        if p.exists():
            return str(p)
    return None


def main(command: str, db_path_arg: Optional[str] = None) -> None:
    db_path = db_path_arg or find_db_path()

    if command == "find":
        print(json.dumps({"dbPath": db_path, "found": db_path is not None}))
        return

    if not db_path:
        print(json.dumps({"error": "Rekordbox database not found"}))
        sys.exit(1)

    try:
        db = Rekordbox6Database(db_path)
        db.open()

        with db.engine.connect() as conn:

            if command == "status":
                count = conn.execute(text(
                    "SELECT count(*) FROM djmdContent "
                    "WHERE FileType IS NOT NULL AND Title IS NOT NULL"
                )).scalar()
                print(json.dumps({
                    "connected": True,
                    "dbPath": db_path,
                    "trackCount": count,
                    "error": None,
                }))

            elif command == "tracks":
                rows = conn.execute(text("""
                    SELECT
                        c.ID            AS id,
                        c.Title         AS title,
                        a.Name          AS artist,
                        al.Name         AS album,
                        g.Name          AS genre,
                        c.BPM           AS bpm,
                        c.Length        AS duration,
                        c.FileType      AS fileType,
                        c.FolderPath    AS folderPath,
                        COALESCE(c.FileNameL, c.FileNameS) AS fileName,
                        c.ColorID       AS colorId,
                        c.Commnt        AS comment,
                        c.Rating        AS rating,
                        k.ScaleName     AS musicalKey
                    FROM djmdContent c
                    LEFT JOIN djmdArtist a  ON c.ArtistID = a.ID
                    LEFT JOIN djmdAlbum  al ON c.AlbumID  = al.ID
                    LEFT JOIN djmdGenre  g  ON c.GenreID  = g.ID
                    LEFT JOIN djmdKey    k  ON c.KeyID    = k.ID
                    WHERE c.FileType IS NOT NULL
                      AND c.Title IS NOT NULL
                    ORDER BY a.Name COLLATE NOCASE, c.Title COLLATE NOCASE
                """)).fetchall()

                tag_rows = conn.execute(text(
                    "SELECT ContentID, MyTagID FROM djmdSongMyTag"
                )).fetchall()
                tag_map: dict = {}
                for tr in tag_rows:
                    cid = str(tr[0])
                    tag_map.setdefault(cid, []).append(str(tr[1]))

                tracks = []
                for r in rows:
                    rid = str(r[0])
                    folder = r[8] or ""
                    fname  = r[9] or ""
                    # FolderPath in Rekordbox 7 is the full file path (includes filename)
                    file_path = folder.strip() or None

                    bpm = None
                    if r[5] is not None:
                        try:
                            bpm = round(float(r[5]) / 100.0, 2) if float(r[5]) > 1000 else round(float(r[5]), 2)
                        except (ValueError, TypeError):
                            bpm = None

                    tracks.append({
                        "id":         rid,
                        "title":      r[1] or "Unknown Title",
                        "artist":     r[2] or "Unknown Artist",
                        "album":      r[3],
                        "genre":      r[4],
                        "bpm":        bpm,
                        "duration":   r[6],
                        "fileType":   r[7],
                        "folderPath": folder or None,
                        "fileName":   fname or None,
                        "filePath":   file_path,
                        "colorId":    r[10],
                        "comment":    r[11],
                        "rating":     r[12],
                        "musicalKey": r[13],
                        "myTagIds":   tag_map.get(rid, []),
                    })

                print(json.dumps({"tracks": tracks, "dbPath": db_path}))

            elif command == "tags":
                rows = conn.execute(text(
                    "SELECT ID, Name, ParentID FROM djmdMyTag ORDER BY Seq"
                )).fetchall()
                tags = [{"id": str(r[0]), "name": r[1], "parentId": str(r[2]) if r[2] else None}
                        for r in rows]
                print(json.dumps({"tags": tags}))

            elif command == "playlists":
                rows = conn.execute(text("""
                    SELECT p.ID, p.Name, p.ParentID, p.Seq, p.Attribute,
                           COUNT(sp.ContentID) AS trackCount
                    FROM djmdPlaylist p
                    LEFT JOIN djmdSongPlaylist sp ON sp.PlaylistID = p.ID
                    GROUP BY p.ID
                    ORDER BY p.Seq
                """)).fetchall()
                playlists = [{
                    "id":         str(r[0]),
                    "name":       r[1],
                    "parentId":   str(r[2]) if r[2] else None,
                    "seq":        r[3] or 0,
                    "attribute":  r[4],
                    "trackCount": r[5] or 0,
                } for r in rows]
                print(json.dumps({"playlists": playlists}))

            elif command == "playlist_tracks":
                playlist_id = sys.argv[3] if len(sys.argv) > 3 else None
                if not playlist_id:
                    print(json.dumps({"error": "playlist_id required as 3rd argument"}))
                    sys.exit(1)
                rows = conn.execute(text("""
                    SELECT c.ID, c.Title, a.Name AS artist
                    FROM djmdSongPlaylist sp
                    JOIN djmdContent c ON sp.ContentID = c.ID
                    LEFT JOIN djmdArtist a ON c.ArtistID = a.ID
                    WHERE sp.PlaylistID = :pid
                    ORDER BY sp.TrackNo
                """), {"pid": playlist_id}).fetchall()
                tracks = [{"id": str(r[0]), "title": r[1], "artist": r[2]} for r in rows]
                print(json.dumps({"tracks": tracks}))

            else:
                print(json.dumps({"error": f"Unknown command: {command}"}))
                sys.exit(1)

    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    path = sys.argv[2] if len(sys.argv) > 2 else None
    main(cmd, path)
