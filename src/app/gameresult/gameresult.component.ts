import { Component, OnInit, Input } from "@angular/core";
import { GameResult } from "../../models/gameresult";

@Component({
  selector: "gameresult",
  templateUrl: "./gameresult.component.html",
  styleUrls: ["./gameresult.component.scss"]
})
export class GameresultComponent implements OnInit {
  @Input() result: GameResult[];
  constructor() { }

  ngOnInit() {
  }

}
